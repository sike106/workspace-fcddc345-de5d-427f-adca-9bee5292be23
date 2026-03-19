import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_MESSAGES = 300

export async function GET(request: NextRequest) {
  return withAuth(request, async (sessionUser) => {
    const { searchParams } = new URL(request.url)
    const requestedUserId = (searchParams.get('userId') || '').trim()
    const isStaff = sessionUser.role === 'admin' || sessionUser.role === 'teacher'
    const targetUserId = isStaff && requestedUserId ? requestedUserId : sessionUser.userId

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (!isStaff && targetUserId !== sessionUser.userId) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, role: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const messages = await db.ideaMessage.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'asc' },
      take: MAX_MESSAGES,
    })

    return NextResponse.json({
      success: true,
      conversation: {
        user: targetUser,
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
  })
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (sessionUser) => {
    const body = await request.json().catch(() => ({}))
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    const isStaff = sessionUser.role === 'admin' || sessionUser.role === 'teacher'
    const targetUserId = isStaff && requestedUserId ? requestedUserId : sessionUser.userId

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (!isStaff && targetUserId !== sessionUser.userId) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const created = await db.ideaMessage.create({
      data: {
        userId: targetUserId,
        senderType: isStaff ? 'admin' : 'user',
        senderName: isStaff ? sessionUser.name : targetUser.name,
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
  })
}
