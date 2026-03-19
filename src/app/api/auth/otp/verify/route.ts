import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyEmailOtp } from '@/lib/otp'
import { generateToken, setAuthCookie, getUserNickname, syncGuestData, verifyLoginOtpSessionToken, resolveUserAvatar } from '@/lib/auth'
import { hashPassword } from '@/lib/auth'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const purpose = body?.purpose === 'password_reset' ? 'password_reset' : 'login'
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    const otpSessionToken = typeof body?.otpSessionToken === 'string' ? body.otpSessionToken.trim() : ''

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and OTP are required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (purpose === 'password_reset' && newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters', code: 'WEAK_PASSWORD' },
        { status: 400 }
      )
    }

    const normalizedEmail = normalizeEmail(email)
    if (purpose === 'login') {
      const session = await verifyLoginOtpSessionToken(otpSessionToken)
      if (!session || normalizeEmail(session.email) !== normalizedEmail) {
        return NextResponse.json(
          { error: 'Password verification required before OTP login', code: 'OTP_SESSION_INVALID' },
          { status: 401 }
        )
      }
    }

    const verification = await verifyEmailOtp(normalizedEmail, purpose, code)
    if (!verification.ok) {
      return NextResponse.json(
        { error: 'Invalid or expired OTP', code: verification.code },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user || user.isGuest) {
      return NextResponse.json(
        { error: 'Account not found', code: 'INVALID_ACCOUNT' },
        { status: 404 }
      )
    }

    if (purpose === 'password_reset') {
      const hashedPassword = await hashPassword(newPassword)
      await db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      })
    } else {
      const session = await verifyLoginOtpSessionToken(otpSessionToken)
      if (session?.guestId && session.guestId !== user.id) {
        try {
          await syncGuestData(session.guestId, user.id)
        } catch (error) {
          console.error('Failed to sync guest data after OTP login:', error)
        }
      }
    }

    const token = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nickname: await getUserNickname(user.id),
        avatar: resolveUserAvatar(user.avatar, user.email),
        role: user.role,
        isGuest: user.isGuest,
      },
    })

    await setAuthCookie(response, token)
    return response
  } catch (error) {
    console.error('OTP verify error:', error)
    return NextResponse.json(
      { error: 'Failed to verify OTP', code: 'OTP_ERROR' },
      { status: 500 }
    )
  }
}
