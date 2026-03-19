import { NextRequest, NextResponse } from 'next/server'
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose'
import { db } from '@/lib/db'
import {
  assignUserNickname,
  generateToken,
  isAdminAllowlisted,
  resolveUserAvatar,
  setAuthCookie,
  syncGuestData,
} from '@/lib/auth'

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'exam-challenger-5b22d'

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
)

async function verifyFirebaseIdToken(idToken: string): Promise<JWTPayload & {
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}> {
  const issuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer,
    audience: FIREBASE_PROJECT_ID,
  })

  return payload as JWTPayload & {
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : ''
    const guestId = typeof body?.guestId === 'string' ? body.guestId.trim() : ''

    if (!idToken) {
      return NextResponse.json(
        { error: 'Google token is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const payload = await verifyFirebaseIdToken(idToken)
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const name = typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : email.split('@')[0] || 'Google User'
    const googlePicture = typeof payload.picture === 'string' ? payload.picture.trim() : ''

    if (!email) {
      return NextResponse.json(
        { error: 'Google account email not available', code: 'INVALID_GOOGLE_ACCOUNT' },
        { status: 400 }
      )
    }

    if (payload.email_verified !== true) {
      return NextResponse.json(
        { error: 'Google email is not verified', code: 'UNVERIFIED_GOOGLE_EMAIL' },
        { status: 400 }
      )
    }

    let user = await db.user.findUnique({
      where: { email },
    })

    if (!user) {
      const allowlistedAdmin = isAdminAllowlisted(email)
      user = await db.user.create({
        data: {
          email,
          name,
          avatar: googlePicture || null,
          password: null,
          role: allowlistedAdmin ? 'admin' : 'student',
          isGuest: false,
        },
      })
    } else if (user.isGuest) {
      return NextResponse.json(
        { error: 'Guest account cannot be used for Google login', code: 'INVALID_GOOGLE_ACCOUNT' },
        { status: 400 }
      )
    } else if ((user.name !== name && name) || (!user.avatar && googlePicture)) {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          ...(user.name !== name && name ? { name } : {}),
          ...(!user.avatar && googlePicture ? { avatar: googlePicture } : {}),
        },
      })
    }

    if (guestId && guestId !== user.id) {
      try {
        await syncGuestData(guestId, user.id)
      } catch (error) {
        console.error('Failed to sync guest data during Google login:', error)
      }
    }

    const nickname = await assignUserNickname(
      user.id,
      name || email.split('@')[0] || 'user'
    )

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
        nickname,
        avatar: resolveUserAvatar(user.avatar, user.email),
        role: user.role,
        isGuest: user.isGuest,
        createdAt: user.createdAt,
        suspendedUntil: user.suspendedUntil,
        suspensionReason: user.suspensionReason || null,
        suspensionMessagingDisabled: user.suspensionMessagingDisabled,
      },
    })

    await setAuthCookie(response, token)
    return response
  } catch (error) {
    console.error('Google login error:', error)
    return NextResponse.json(
      { error: 'Google login failed', code: 'GOOGLE_LOGIN_FAILED' },
      { status: 500 }
    )
  }
}
