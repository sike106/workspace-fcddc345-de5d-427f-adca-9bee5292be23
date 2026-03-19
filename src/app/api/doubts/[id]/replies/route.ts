import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { detectAbusiveLanguage, suspendUserTemporarily } from '@/lib/moderation'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withAuth(request, async () => {
    const { id } = await context.params

    const doubt = await db.doubt.findUnique({
      where: { id },
      select: { id: true, isDeleted: true },
    })

    if (!doubt || doubt.isDeleted) {
      return NextResponse.json(
        { error: 'Doubt not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const replies = await db.doubtReply.findMany({
      where: { doubtId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      replies: replies.map((reply) => ({
        id: reply.id,
        doubtId: reply.doubtId,
        content: reply.content,
        authorType: reply.authorType,
        authorName: reply.authorName || reply.user?.name || (reply.authorType === 'ai' ? 'AI Buddy' : 'Community Member'),
        authorUserId: reply.user?.id || null,
        authorRole: reply.user?.role || null,
        createdAt: reply.createdAt,
      })),
    })
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (user) => {
    const requester = await db.user.findUnique({
      where: { id: user.userId },
      select: { id: true, isGuest: true },
    })

    if (!requester) {
      return NextResponse.json(
        { error: 'Invalid user session', code: 'INVALID_TOKEN' },
        { status: 401 }
      )
    }

    if (requester.isGuest) {
      return NextResponse.json(
        {
          error: 'Guest users can view doubts only. Please sign in to answer.',
          code: 'GUEST_READ_ONLY',
        },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const body = await request.json()
    const content = typeof body?.content === 'string' ? body.content.trim() : ''

    if (!content) {
      return NextResponse.json(
        { error: 'Reply content is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const doubt = await db.doubt.findUnique({
      where: { id },
      select: { id: true, isDeleted: true },
    })

    if (!doubt || doubt.isDeleted) {
      return NextResponse.json(
        { error: 'Doubt not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const moderation = detectAbusiveLanguage(content)
    if (moderation.flagged) {
      const suspendedUntil = await suspendUserTemporarily(
        user.userId,
        'Abusive language in reply submission'
      )

      return NextResponse.json(
        {
          error: 'Reply blocked by AI moderation due to abusive language.',
          code: 'SUSPENDED',
          suspendedUntil: suspendedUntil.toISOString(),
          moderated: true,
        },
        { status: 403 }
      )
    }

    const authorType = user.role === 'admin' || user.role === 'teacher' ? 'admin' : 'user'

    const reply = await db.doubtReply.create({
      data: {
        doubtId: id,
        userId: user.userId,
        authorType,
        authorName: authorType === 'admin' ? 'Admin' : null,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    })

    await db.doubt.update({
      where: { id },
      data: {
        status: 'resolved',
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      reply: {
        id: reply.id,
        doubtId: reply.doubtId,
        content: reply.content,
        authorType: reply.authorType,
        authorName: reply.authorName || reply.user?.name || 'Community Member',
        authorUserId: reply.user?.id || null,
        authorRole: reply.user?.role || null,
        createdAt: reply.createdAt,
      },
    })
  })
}
