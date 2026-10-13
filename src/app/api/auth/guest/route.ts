import { NextRequest, NextResponse } from 'next/server'
import { createGuestUser, setAuthCookie, resolveUserAvatar } from '@/lib/auth'
import { db } from '@/lib/db'
import { GUEST_SESSION_MAX_AGE_SECONDS } from '@/lib/guest-config'

const DEFAULT_GUEST_DEVICE_MAX_LOGINS = process.env.NODE_ENV === 'production' ? 2 : 0
const parsedGuestDeviceMaxLogins = Number.parseInt(process.env.GUEST_DEVICE_MAX_LOGINS || '', 10)
const GUEST_DEVICE_MAX_LOGINS = Number.isFinite(parsedGuestDeviceMaxLogins)
  ? parsedGuestDeviceMaxLogins
  : DEFAULT_GUEST_DEVICE_MAX_LOGINS
const DEVICE_LIMIT_ENABLED = GUEST_DEVICE_MAX_LOGINS > 0
const GUEST_COOKIE_MAX_AGE_SECONDS = GUEST_SESSION_MAX_AGE_SECONDS

function normalizeDeviceId(value: string): string {
  return value.trim().toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const deviceIdRaw = typeof body?.deviceId === 'string' ? body.deviceId : ''
    const deviceId = normalizeDeviceId(deviceIdRaw)

    if (!deviceId || deviceId.length < 12 || deviceId.length > 128) {
      return NextResponse.json(
        { error: 'Valid deviceId is required for guest login', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const usage = await db.guestDeviceUsage.findUnique({
      where: { deviceId },
      select: { guestLogins: true },
    })

    if (DEVICE_LIMIT_ENABLED && (usage?.guestLogins || 0) >= GUEST_DEVICE_MAX_LOGINS) {
      return NextResponse.json(
        {
          error: 'Guest login limit reached on this device. Please sign in with an account.',
          code: 'GUEST_DEVICE_LIMIT',
          allowedLogins: GUEST_DEVICE_MAX_LOGINS,
        },
        { status: 403 }
      )
    }

    const { user, token } = await createGuestUser()
    const now = new Date()
    const guestExpiresAt = new Date(user.createdAt.getTime() + GUEST_SESSION_MAX_AGE_SECONDS * 1000)
    const nextGuestLogins = (usage?.guestLogins || 0) + 1

    await db.guestDeviceUsage.upsert({
      where: { deviceId },
      update: {
        guestLogins: nextGuestLogins,
        lastLoginAt: now,
      },
      create: {
        deviceId,
        guestLogins: nextGuestLogins,
        lastLoginAt: now,
      },
    })
    
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nickname: user.nickname || null,
        avatar: resolveUserAvatar(user.avatar, user.email),
        role: user.role,
        isGuest: true,
        createdAt: user.createdAt.toISOString(),
        guestExpiresAt: guestExpiresAt.toISOString(),
        suspendedUntil: user.suspendedUntil,
        suspensionReason: user.suspensionReason || null,
        suspensionMessagingDisabled: user.suspensionMessagingDisabled,
      },
      guestUsage: {
        used: nextGuestLogins,
        limit: DEVICE_LIMIT_ENABLED ? GUEST_DEVICE_MAX_LOGINS : null,
        remaining: DEVICE_LIMIT_ENABLED ? Math.max(0, GUEST_DEVICE_MAX_LOGINS - nextGuestLogins) : null,
        unlimited: !DEVICE_LIMIT_ENABLED,
      },
      sessionMinutes: Math.floor(GUEST_SESSION_MAX_AGE_SECONDS / 60),
      guestExpiresAt: guestExpiresAt.toISOString(),
    })
    
    await setAuthCookie(response, token, GUEST_COOKIE_MAX_AGE_SECONDS)
    
    return response
  } catch (error) {
    console.error('Guest creation error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      {
        error: 'Failed to create guest session',
        code: 'SERVER_ERROR',
        ...(isDev
          ? { details: (error as Error)?.message || String(error) }
          : {}),
      },
      { status: 500 }
    )
  }
}
