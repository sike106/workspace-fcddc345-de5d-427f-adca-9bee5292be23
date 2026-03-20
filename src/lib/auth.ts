import { db } from './db'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { GUEST_SESSION_MAX_AGE_SECONDS } from './guest-config'

const JWT_SECRET = process.env.JWT_SECRET || 'jee-study-buddy-secret-key-2024'
const AUTH_COOKIE_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7 // 7 days
const PASSWORD_REAUTH_COOKIE = 'password_reauth_token'
const PASSWORD_REAUTH_MAX_AGE_SECONDS = 60 * 3 // 3 minutes
const ADMIN_ALLOWLIST = (process.env.ADMIN_ALLOWLIST || '')
  .split(',')
  .map(entry => entry.trim().toLowerCase())
  .filter(Boolean)

export interface JWTPayload {
  userId: string
  email: string
  role: string
  name: string
}

interface PasswordReauthPayload {
  purpose: 'password_reauth'
  userId: string
}

interface WithAuthOptions {
  allowSuspended?: boolean
}

const NICKNAME_MAX_LENGTH = 24

export function getEmailAvatarUrl(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return 'https://www.gravatar.com/avatar/?d=mp&s=256'
  const hash = createHash('md5').update(normalized).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?d=mp&s=256`
}

export function resolveUserAvatar(avatar: string | null | undefined, email: string): string {
  const cleaned = typeof avatar === 'string' ? avatar.trim() : ''
  return cleaned || getEmailAvatarUrl(email)
}

function userModelSupportsNicknameField(): boolean {
  const runtimeModel = (db as any)?._runtimeDataModel?.models?.User
  if (!runtimeModel || !Array.isArray(runtimeModel.fields)) return false
  return runtimeModel.fields.some((field: { name?: string }) => field?.name === 'nickname')
}

function normalizeNicknameSeed(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'user'
}

export async function generateUniqueNickname(seed: string): Promise<string> {
  const base = normalizeNicknameSeed(seed).slice(0, NICKNAME_MAX_LENGTH) || 'user'

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${Math.random().toString(36).slice(2, 6)}`
    const candidate = `${base.slice(0, Math.max(1, NICKNAME_MAX_LENGTH - suffix.length))}${suffix}`
    const existing = await db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "User" WHERE "nickname" = ${candidate} LIMIT 1`
    )

    if (!existing[0]) {
      return candidate
    }
  }

  return `user_${Date.now().toString(36).slice(-6)}`
}

export async function getUserNickname(userId: string): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ nickname: string | null }>>(
    Prisma.sql`SELECT "nickname" FROM "User" WHERE "id" = ${userId} LIMIT 1`
  )

  return rows[0]?.nickname || null
}

export async function assignUserNickname(
  userId: string,
  seed: string,
  options: { forceRegenerate?: boolean } = {}
): Promise<string> {
  const { forceRegenerate = false } = options

  if (!forceRegenerate) {
    const existingNickname = await getUserNickname(userId)
    if (existingNickname) return existingNickname
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const nickname = await generateUniqueNickname(seed)

    try {
      if (userModelSupportsNicknameField()) {
        await db.user.update({
          where: { id: userId },
          data: { nickname },
        })
      } else {
        await db.$executeRaw(
          Prisma.sql`
            UPDATE "User"
            SET "nickname" = ${nickname}, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${userId}
          `
        )
      }

      return nickname
    } catch (error) {
      const isKnown = error instanceof Prisma.PrismaClientKnownRequestError
      const isUniqueNickname =
        isKnown &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('nickname')

      const message = typeof (error as Error)?.message === 'string' ? (error as Error).message.toLowerCase() : ''
      const isRawUniqueConstraint =
        message.includes('unique constraint failed') &&
        message.includes('nickname')

      if (isUniqueNickname || isRawUniqueConstraint) {
        continue
      }

      throw error
    }
  }

  throw new Error('Unable to assign unique nickname')
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

// Verify password
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

// Generate JWT token
export async function generateToken(payload: JWTPayload, expiresIn: string = '7d'): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    return payload as JWTPayload
  } catch {
    return null
  }
}

async function generatePasswordReauthToken(payload: PasswordReauthPayload): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT(payload as unknown as Record<string, string>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('3m')
    .sign(secret)
}

async function verifyPasswordReauthToken(token: string): Promise<PasswordReauthPayload | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    if (payload.purpose !== 'password_reauth' || typeof payload.userId !== 'string') {
      return null
    }
    return {
      purpose: 'password_reauth',
      userId: payload.userId,
    }
  } catch {
    return null
  }
}

// Get current user from cookies
export async function getCurrentUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  
  if (!token) return null
  return verifyToken(token)
}

// Set auth cookie
export async function setAuthCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number = AUTH_COOKIE_MAX_AGE_DEFAULT
) {
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
    path: '/'
  })
}

export async function setPasswordReauthCookie(response: NextResponse, userId: string) {
  const token = await generatePasswordReauthToken({
    purpose: 'password_reauth',
    userId,
  })

  response.cookies.set(PASSWORD_REAUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PASSWORD_REAUTH_MAX_AGE_SECONDS,
    path: '/',
  })
}

export async function hasValidPasswordReauth(
  request: NextRequest,
  userId: string
): Promise<boolean> {
  const token = request.cookies.get(PASSWORD_REAUTH_COOKIE)?.value
  if (!token) return false

  const payload = await verifyPasswordReauthToken(token)
  return Boolean(payload && payload.userId === userId)
}

// Clear auth cookie
export async function clearAuthCookie(response: NextResponse) {
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  })
}

export async function clearPasswordReauthCookie(response: NextResponse) {
  response.cookies.set(PASSWORD_REAUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

// Create guest user
export async function createGuestUser(): Promise<{ user: any; token: string }> {
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const guestName = `Guest_${Math.random().toString(36).substring(2, 8)}`

    try {
      const user = await db.user.create({
        data: {
          email: `${guestId}@guest.jee`,
          name: guestName,
          password: null,
          role: 'student',
          isGuest: true
        }
      })

      const nickname = await assignUserNickname(user.id, guestName, { forceRegenerate: true })
      user.nickname = nickname

      const token = await generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      }, '10m')

      return { user, token }
    } catch (err: any) {
      const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
      const isUniqueEmail =
        isKnown &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        err.meta?.target.includes('email')

      if (isUniqueEmail) {
        continue
      }

      const message = typeof err?.message === 'string' ? err.message.toLowerCase() : ''
      if (message.includes('database is locked') && attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }

      throw err
    }
  }

  throw new Error('Unable to create guest user after multiple attempts')
}

export function isAdminAllowlisted(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  return ADMIN_ALLOWLIST.includes(normalized)
}

// Convert guest to regular user
export async function convertGuestToUser(
  guestUserId: string,
  email: string,
  password: string,
  name: string
): Promise<{ user: any; token: string }> {
  const hashedPassword = await hashPassword(password)
  
  const user = await db.user.update({
    where: { id: guestUserId },
    data: {
      email,
      password: hashedPassword,
      name,
      isGuest: false
    }
  })

  user.nickname = await assignUserNickname(
    user.id,
    name || email.split('@')[0] || 'user',
    { forceRegenerate: true }
  )
  
  const token = await generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  })
  
  return { user, token }
}

// Auth middleware for API routes
export async function withAuth(
  request: NextRequest,
  handler: (user: JWTPayload, request: NextRequest) => Promise<NextResponse>,
  options: WithAuthOptions = {}
): Promise<NextResponse> {
  const token = request.cookies.get('auth_token')?.value
  
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }
  
  const payload = await verifyToken(token)
  
  if (!payload) {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      { status: 401 }
    )
  }

  const maxAttempts = 3
  let userState: {
    id: string
    suspendedUntil: Date | null
    suspensionReason: string | null
    isGuest: boolean
    createdAt: Date
  } | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      userState = await db.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, suspendedUntil: true, suspensionReason: true, isGuest: true, createdAt: true },
      })
      break
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message.toLowerCase() : ''
      if (message.includes('database is locked') && attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }
      throw err
    }
  }

  if (!userState) {
    return NextResponse.json(
      { error: 'Invalid user session', code: 'INVALID_TOKEN' },
      { status: 401 }
    )
  }

  if (
    !options.allowSuspended &&
    userState.suspendedUntil &&
    userState.suspendedUntil.getTime() > Date.now()
  ) {
    return NextResponse.json(
      {
        error: 'Your account is temporarily suspended due to policy violation.',
        code: 'SUSPENDED',
        suspendedUntil: userState.suspendedUntil.toISOString(),
        suspensionReason: userState.suspensionReason || null,
      },
      { status: 403 }
    )
  }

  if (userState.isGuest) {
    const guestExpiresAt = userState.createdAt.getTime() + GUEST_SESSION_MAX_AGE_SECONDS * 1000
    if (Date.now() > guestExpiresAt) {
      return NextResponse.json(
        {
          error: 'Guest session expired. Please continue by signing in or starting a new guest session.',
          code: 'GUEST_EXPIRED',
          guestExpiresAt: new Date(guestExpiresAt).toISOString(),
        },
        { status: 401 }
      )
    }
  }
  
  return handler(payload, request)
}

// Role-based access control
export async function withRole(
  request: NextRequest,
  allowedRoles: string[],
  handler: (user: JWTPayload, request: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user, req) => {
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    return handler(user, req)
  })
}

// Sync guest data to user account
export async function syncGuestData(guestUserId: string, newUserId: string) {
  // Transfer progress
  await db.progress.updateMany({
    where: { userId: guestUserId },
    data: { userId: newUserId }
  })
  
  // Transfer AI history
  await db.aIHistory.updateMany({
    where: { userId: guestUserId },
    data: { userId: newUserId }
  })
  
  // Transfer revision notes
  await db.revisionNote.updateMany({
    where: { userId: guestUserId },
    data: { userId: newUserId }
  })
  
  // Transfer mock results
  await db.mockResult.updateMany({
    where: { userId: guestUserId },
    data: { userId: newUserId }
  })
  
  // Delete guest user
  await db.user.delete({ where: { id: guestUserId } })
}
