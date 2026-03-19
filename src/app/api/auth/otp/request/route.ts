import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { issueEmailOtp } from '@/lib/otp'
import { sendOtpEmail } from '@/lib/email'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email : ''
    const purpose = body?.purpose === 'password_reset' ? 'password_reset' : 'login'

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (purpose === 'login') {
      return NextResponse.json(
        {
          error: 'Login OTP is sent only after password verification.',
          code: 'LOGIN_OTP_PASSWORD_REQUIRED',
        },
        { status: 403 }
      )
    }

    const normalizedEmail = normalizeEmail(email)
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, isGuest: true },
    })

    if (!user || user.isGuest) {
      // Do not leak account existence.
      return NextResponse.json({ success: true })
    }

    const issued = await issueEmailOtp(normalizedEmail, purpose)
    if (!issued.ok) {
      return NextResponse.json(
        {
          error: 'OTP recently sent. Please wait before retrying.',
          code: issued.code,
          retryAfter: issued.retryAfter,
        },
        { status: 429 }
      )
    }

    const delivered = await sendOtpEmail({
      to: normalizedEmail,
      code: issued.code,
      purpose,
      expiresAt: issued.expiresAt,
    })

    return NextResponse.json({
      success: true,
      expiresAt: issued.expiresAt.toISOString(),
      delivered,
      ...(process.env.NODE_ENV !== 'production' ? { debugCode: issued.code } : {}),
    })
  } catch (error) {
    console.error('OTP request error:', error)
    return NextResponse.json(
      { error: 'Failed to send OTP', code: 'OTP_ERROR' },
      { status: 500 }
    )
  }
}
