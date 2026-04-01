import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, generateToken, setAuthCookie, syncGuestData, getUserNickname, clearPasswordReauthCookie, resolveUserAvatar } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, guestId } = body
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    // Validation
    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { error: 'Email and password are required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    // Find user
    const user = await db.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

    if (!user.password) {
      return NextResponse.json(
        {
          error: 'This account uses Google login. Please sign in with Google.',
          code: 'PASSWORD_NOT_SET',
        },
        { status: 401 }
      )
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password)

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

    if (guestId) {
      try {
        await syncGuestData(guestId, user.id)
      } catch (e) {
        console.error('Failed to sync guest data:', e)
      }
    }

    const token = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    })

    const nickname = await getUserNickname(user.id)
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nickname,
        avatar: resolveUserAvatar(user.avatar, user.email),
        role: user.role,
        isGuest: user.isGuest,
        createdAt: user.createdAt,
        suspendedUntil: user.suspendedUntil,
        suspensionReason: user.suspensionReason || null,
        suspensionMessagingDisabled: user.suspensionMessagingDisabled,
      }
    })

    await setAuthCookie(response, token)
    await clearPasswordReauthCookie(response)

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
