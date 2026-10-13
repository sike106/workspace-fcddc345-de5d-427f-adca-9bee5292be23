import { NextRequest, NextResponse } from 'next/server'
import { withAuth, hashPassword, hasValidPasswordReauth, clearPasswordReauthCookie } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

      if (!newPassword) {
        return NextResponse.json(
          { error: 'New password is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters', code: 'WEAK_PASSWORD' },
          { status: 400 }
        )
      }

      const account = await db.user.findUnique({
        where: { id: user.userId },
        select: { id: true, password: true, isGuest: true },
      })

      if (!account || account.isGuest || !account.password) {
        return NextResponse.json(
          { error: 'Password is not available for this account.', code: 'PASSWORD_NOT_SET' },
          { status: 400 }
        )
      }

      const hasReauth = await hasValidPasswordReauth(request, user.userId)
      if (!hasReauth) {
        return NextResponse.json(
          {
            error: 'Please re-login in My Account, then change password within 3 minutes.',
            code: 'REAUTH_REQUIRED',
          },
          { status: 401 }
        )
      }

      const hashedPassword = await hashPassword(newPassword)
      await db.user.update({
        where: { id: user.userId },
        data: { password: hashedPassword },
      })

      const response = NextResponse.json({ success: true })
      await clearPasswordReauthCookie(response)
      return response
    } catch (error) {
      console.error('Password change error:', error)
      return NextResponse.json(
        { error: 'Failed to change password', code: 'PASSWORD_ERROR' },
        { status: 500 }
      )
    }
  })
}
