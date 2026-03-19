import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { suspendUserTemporarily } from '@/lib/moderation'

type RouteContext = {
  params: Promise<{ id: string }>
}

async function getTargetUser(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      suspendedUntil: true,
      suspensionReason: true,
      suspensionMessagingDisabled: true,
    },
  })
}

function serializeUser(user: Awaited<ReturnType<typeof getTargetUser>>) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
    suspensionReason: user.suspensionReason || null,
    suspensionMessagingDisabled: user.suspensionMessagingDisabled,
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withRole(request, ['admin'], async (adminUser) => {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: 'User id is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (id === adminUser.userId) {
      return NextResponse.json(
        { error: 'Admin cannot block this account.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const targetUser = await getTargetUser(id)
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (targetUser.role === 'admin') {
      return NextResponse.json(
        { error: 'Admin accounts cannot be blocked from this panel.', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const reasonRaw = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const reason = reasonRaw || 'Policy violation'
    const minutesRaw = Number.parseInt(String(body?.minutes ?? ''), 10)
    const minutes = Number.isFinite(minutesRaw)
      ? Math.min(Math.max(minutesRaw, 1), 60 * 24 * 14)
      : 60

    const suspendedUntil = await suspendUserTemporarily(
      id,
      `Admin blocked account: ${reason}`,
      minutes
    )

    const updatedUser = await getTargetUser(id)

    return NextResponse.json({
      success: true,
      user: serializeUser(updatedUser),
      suspendedUntil: suspendedUntil.toISOString(),
    })
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withRole(request, ['admin'], async () => {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: 'User id is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const targetUser = await getTargetUser(id)
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    if (typeof body?.messagingDisabled !== 'boolean') {
      return NextResponse.json(
        { error: 'messagingDisabled boolean is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const messagingDisabled = body.messagingDisabled
    await db.$transaction([
      db.user.update({
        where: { id },
        data: {
          suspensionMessagingDisabled: messagingDisabled,
        },
      }),
      db.suspensionMessage.create({
        data: {
          userId: id,
          senderType: 'system',
          senderName: 'Admin',
          message: messagingDisabled
            ? 'Admin has disabled your appeal messages for now.'
            : 'Admin has enabled your appeal messages again.',
        },
      }),
    ])

    const updatedUser = await getTargetUser(id)
    return NextResponse.json({
      success: true,
      user: serializeUser(updatedUser),
    })
  })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withRole(request, ['admin'], async () => {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: 'User id is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const user = await getTargetUser(id)

    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    await db.$transaction([
      db.user.update({
        where: { id },
        data: {
          suspendedUntil: null,
          suspensionReason: null,
          suspensionMessagingDisabled: false,
        },
      }),
      db.suspensionMessage.create({
        data: {
          userId: id,
          senderType: 'system',
          senderName: 'Admin',
          message: 'Your account restriction has been removed by admin.',
        },
      }),
    ])

    const updatedUser = await getTargetUser(id)

    return NextResponse.json({
      success: true,
      user: serializeUser(updatedUser),
    })
  })
}
