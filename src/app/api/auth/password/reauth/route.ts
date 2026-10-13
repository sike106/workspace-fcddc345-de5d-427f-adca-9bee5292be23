import { NextRequest, NextResponse } from 'next/server'
import { withAuth, verifyPassword, setPasswordReauthCookie } from '@/lib/auth'
import { db } from '@/lib/db'

const PASSWORD_REAUTH_WINDOW_MS = 3 * 60 * 1000

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const password = typeof body?.password === 'string' ? body.password : ''

      if (!password) {
        return NextResponse.json(
          { error: 'Password is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const account = await db.user.findUnique({
        where: { id: user.userId },
        select: { id: true, password: true, isGuest: true },
      })

      if (!account) {
        return NextResponse.json(
          { error: 'Invalid user session', code: 'INVALID_TOKEN' },
          { status: 401 }
        )
      }

      if (account.isGuest || !account.password) {
        return NextResponse.json(
          { error: 'Password re-auth is only available for registered accounts.', code: 'PASSWORD_NOT_SET' },
          { status: 400 }
        )
      }

      const isValid = await verifyPassword(password, account.password)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid password', code: 'INVALID_PASSWORD' },
          { status: 401 }
        )
      }

      const response = NextResponse.json({
        success: true,
        reauthExpiresAt: new Date(Date.now() + PASSWORD_REAUTH_WINDOW_MS).toISOString(),
      })

      await setPasswordReauthCookie(response, user.userId)
      return response
    } catch (error) {
      console.error('Password re-auth error:', error)
      return NextResponse.json(
        { error: 'Failed to verify password', code: 'REAUTH_ERROR' },
        { status: 500 }
      )
    }
  })
}
