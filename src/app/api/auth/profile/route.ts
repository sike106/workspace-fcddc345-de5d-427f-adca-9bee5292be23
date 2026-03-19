import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withAuth, getUserNickname, resolveUserAvatar } from '@/lib/auth'
import { db } from '@/lib/db'

const NICKNAME_REGEX = /^[a-z0-9_]{3,24}$/
const DATA_IMAGE_REGEX = /^data:image\/(png|jpe?g);base64,[a-z0-9+/=]+$/i
const AVATAR_MAX_LENGTH = 1_600_000

function normalizeNickname(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function validateAvatar(value: string): { ok: true; avatar: string | null } | { ok: false; message: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, avatar: null }

  if (trimmed.length > AVATAR_MAX_LENGTH) {
    return { ok: false, message: 'Image is too large. Please use a smaller photo.' }
  }

  if (trimmed.startsWith('data:image/')) {
    if (!DATA_IMAGE_REGEX.test(trimmed)) {
      return { ok: false, message: 'Only PNG/JPG/JPEG image data is allowed.' }
    }
    return { ok: true, avatar: trimmed }
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, message: 'Avatar URL must start with http or https.' }
    }
  } catch {
    return { ok: false, message: 'Invalid avatar URL.' }
  }

  return { ok: true, avatar: trimmed }
}

export async function PATCH(request: NextRequest) {
  return withAuth(request, async (sessionUser) => {
    try {
      const body = await request.json()
      const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
      const rawNickname = typeof body?.nickname === 'string' ? body.nickname.trim() : ''
      const rawAvatar = typeof body?.avatar === 'string' ? body.avatar.trim() : ''

      if (!rawName || rawName.length < 2 || rawName.length > 60) {
        return NextResponse.json(
          { error: 'Name must be between 2 and 60 characters.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      let nicknameToSave: string | null = null
      if (rawNickname.length > 0) {
        const normalized = normalizeNickname(rawNickname)
        if (!NICKNAME_REGEX.test(normalized)) {
          return NextResponse.json(
            {
              error: 'Nickname must be 3-24 chars and use only letters, numbers, underscore.',
              code: 'VALIDATION_ERROR',
            },
            { status: 400 }
          )
        }

        const existing = await db.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "User"
            WHERE LOWER("nickname") = LOWER(${normalized}) AND "id" <> ${sessionUser.userId}
            LIMIT 1
          `
        )

        if (existing[0]) {
          return NextResponse.json(
            { error: 'Nickname already taken. Please choose another.', code: 'NICKNAME_TAKEN' },
            { status: 409 }
          )
        }

        nicknameToSave = normalized
      }

      const avatarValidation = validateAvatar(rawAvatar)
      if (!avatarValidation.ok) {
        return NextResponse.json(
          { error: avatarValidation.message, code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }
      const avatarToSave = avatarValidation.avatar

      await db.$executeRaw(
        Prisma.sql`
          UPDATE "User"
          SET
            "name" = ${rawName},
            "nickname" = ${nicknameToSave},
            "avatar" = ${avatarToSave},
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${sessionUser.userId}
        `
      )

      const updatedUser = await db.user.findUnique({
        where: { id: sessionUser.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isGuest: true,
          createdAt: true,
          avatar: true,
          suspendedUntil: true,
          suspensionReason: true,
          suspensionMessagingDisabled: true,
        },
      })

      if (!updatedUser) {
        return NextResponse.json(
          { error: 'User not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }

      const nickname = await getUserNickname(updatedUser.id)

      return NextResponse.json({
        success: true,
        user: {
          ...updatedUser,
          nickname,
          avatar: resolveUserAvatar(updatedUser.avatar, updatedUser.email),
        },
      })
    } catch (error) {
      console.error('Profile update error:', error)
      return NextResponse.json(
        { error: 'Failed to update profile', code: 'PROFILE_UPDATE_ERROR' },
        { status: 500 }
      )
    }
  }, { allowSuspended: true })
}
