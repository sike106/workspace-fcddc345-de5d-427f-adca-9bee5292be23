import { NextRequest, NextResponse } from 'next/server'
import { withAuth, getUserNickname, resolveUserAvatar } from '@/lib/auth'
import { db } from '@/lib/db'
import { GUEST_SESSION_MAX_AGE_SECONDS } from '@/lib/guest-config'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value
    if (!token) {
      return NextResponse.json({ user: null })
    }
    return await withAuth(request, async (user) => {
      const fullUser = await db.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isGuest: true,
          avatar: true,
          createdAt: true,
          suspendedUntil: true,
          suspensionReason: true,
          suspensionMessagingDisabled: true,
        }
      })
      
      if (!fullUser) {
        return NextResponse.json(
          { error: 'User not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }
      
      const guestExpiresAt =
        fullUser.isGuest
          ? new Date(fullUser.createdAt.getTime() + GUEST_SESSION_MAX_AGE_SECONDS * 1000)
          : null
      const nickname = await getUserNickname(fullUser.id)

      return NextResponse.json({
        user: {
          ...fullUser,
          nickname,
          avatar: resolveUserAvatar(fullUser.avatar, fullUser.email),
          guestExpiresAt,
        },
      })
    }, { allowSuspended: true })
  } catch (error) {
    console.error('Auth me error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      {
        error: 'Failed to load user session.',
        code: 'SERVER_ERROR',
        ...(isDev
          ? { details: (error as Error)?.message || String(error) }
          : {}),
      },
      { status: 500 }
    )
  }
}
