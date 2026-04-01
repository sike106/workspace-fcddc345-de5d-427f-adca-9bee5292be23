import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, generateToken, setAuthCookie, isAdminAllowlisted, assignUserNickname, resolveUserAvatar } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name, role = 'student' } = body
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    // Validation
    if (!normalizedEmail || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters', code: 'WEAK_PASSWORD' },
        { status: 400 }
      )
    }

    // Check if user exists
    const existingUser = await db.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered', code: 'EMAIL_EXISTS' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await hashPassword(password)
    // Create user
    const allowlistedAdmin = isAdminAllowlisted(normalizedEmail)
    const finalRole = allowlistedAdmin ? 'admin' : (role === 'teacher' ? 'teacher' : 'student')

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        role: finalRole,
        isGuest: false
      }
    })

    user.nickname = await assignUserNickname(user.id, name || email.split('@')[0] || 'user', {
      forceRegenerate: true,
    })

    // Generate token
    const token = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    })

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nickname: user.nickname,
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
    
    return response
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
