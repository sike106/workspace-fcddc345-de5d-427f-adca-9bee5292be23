import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { detectAbusiveLanguage, suspendUserTemporarily } from '@/lib/moderation'

const MAX_MESSAGE_FETCH = 300

async function getUserState(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      suspendedUntil: true,
      suspensionReason: true,
      suspensionMessagingDisabled: true,
      isGuest: true,
    },
  })
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (sessionUser) => {
    const { searchParams } = new URL(request.url)
    const requestedUserId = (searchParams.get('userId') || '').trim()
    const isAdmin = sessionUser.role === 'admin'

    const targetUserId = isAdmin && requestedUserId
      ? requestedUserId
      : sessionUser.userId

    const targetUser = await getUserState(targetUserId)
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (!isAdmin && targetUser.id !== sessionUser.userId) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const messages = await db.suspensionMessage.findMany({
      where: { userId: targetUser.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_MESSAGE_FETCH,
    })

    return NextResponse.json({
      success: true,
      conversation: {
        user: {
          id: targetUser.id,
          name: targetUser.name,
          role: targetUser.role,
          isGuest: targetUser.isGuest,
          suspendedUntil: targetUser.suspendedUntil ? targetUser.suspendedUntil.toISOString() : null,
          suspensionReason: targetUser.suspensionReason || null,
          suspensionMessagingDisabled: targetUser.suspensionMessagingDisabled,
        },
        messages: messages.map(item => ({
          id: item.id,
          userId: item.userId,
          senderType: item.senderType,
          senderName: item.senderName || null,
          message: item.message,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    })
  }, { allowSuspended: true })
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (sessionUser) => {
    const body = await request.json().catch(() => ({}))
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    const isAdmin = sessionUser.role === 'admin'

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const targetUserId = isAdmin
      ? requestedUserId
      : sessionUser.userId

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Target user is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const targetUser = await getUserState(targetUserId)
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (!isAdmin) {
      const suspendedUntilMs = targetUser.suspendedUntil ? targetUser.suspendedUntil.getTime() : 0
      if (suspendedUntilMs <= Date.now()) {
        return NextResponse.json(
          {
            error: 'Appeal chat is available only while account is restricted.',
            code: 'APPEAL_NOT_AVAILABLE',
          },
          { status: 403 }
        )
      }

      if (targetUser.suspensionMessagingDisabled) {
        return NextResponse.json(
          {
            error: 'Admin has paused your appeal messages for now.',
            code: 'SUSPENSION_CHAT_DISABLED',
          },
          { status: 403 }
        )
      }

      const adminSeed = await db.suspensionMessage.findFirst({
        where: {
          userId: targetUser.id,
          senderType: { in: ['admin', 'system'] },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (!adminSeed) {
        return NextResponse.json(
          {
            error: 'Admin must message you first before you can reply.',
            code: 'ADMIN_MESSAGE_REQUIRED',
          },
          { status: 403 }
        )
      }

      const moderation = detectAbusiveLanguage(message)
      if (moderation.flagged) {
        const suspendedUntil = await suspendUserTemporarily(
          targetUser.id,
          'Abusive language in suspension appeal message',
          30
        )

        return NextResponse.json(
          {
            error: 'Appeal message blocked due to abusive language.',
            code: 'SUSPENDED',
            suspendedUntil: suspendedUntil.toISOString(),
            moderated: true,
          },
          { status: 403 }
        )
      }
    }

    const created = await db.suspensionMessage.create({
      data: {
        userId: targetUser.id,
        senderType: isAdmin ? 'admin' : 'user',
        senderName: isAdmin ? 'Admin' : targetUser.name,
        message,
      },
    })

    return NextResponse.json({
      success: true,
      message: {
        id: created.id,
        userId: created.userId,
        senderType: created.senderType,
        senderName: created.senderName || null,
        message: created.message,
        createdAt: created.createdAt.toISOString(),
      },
    })
  }, { allowSuspended: true })
}
