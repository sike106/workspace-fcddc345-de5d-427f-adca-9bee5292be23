import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { detectAbusiveLanguage, suspendUserTemporarily } from '@/lib/moderation'
import { routeAIQuery } from '@/lib/ai-router'

const MAX_DOUBTS_FETCH = 200

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim().toLowerCase()
    const subject = (searchParams.get('subject') || '').trim()
    const status = (searchParams.get('status') || '').trim()

    const doubts = await db.doubt.findMany({
      where: {
        isDeleted: false,
        ...(subject ? { subject } : {}),
        ...(status && ['pending', 'resolved'].includes(status) ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_DOUBTS_FETCH,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            suspendedUntil: true,
            suspensionReason: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
    })

    const filtered = search
      ? doubts.filter((doubt) =>
          `${doubt.title} ${doubt.description} ${doubt.subject} ${doubt.chapter || ''}`
            .toLowerCase()
            .includes(search)
        )
      : doubts

    return NextResponse.json({
      success: true,
      doubts: filtered.map((doubt) => ({
        id: doubt.id,
        title: doubt.title,
        description: doubt.description,
        subject: doubt.subject,
        chapter: doubt.chapter,
        status: doubt.status,
        createdAt: doubt.createdAt,
        updatedAt: doubt.updatedAt,
        author: {
          id: doubt.user.id,
          name: doubt.user.name,
          role: doubt.user.role,
          suspendedUntil: doubt.user.suspendedUntil,
          suspensionReason: doubt.user.suspensionReason,
        },
        answerCount: doubt._count.replies,
      })),
    })
  })
}

export async function POST(request: NextRequest) {
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
          error: 'Guest users can view doubts only. Please sign in to ask a doubt.',
          code: 'GUEST_READ_ONLY',
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const chapter = typeof body?.chapter === 'string' ? body.chapter.trim() : ''

    if (!title || !description || !subject) {
      return NextResponse.json(
        { error: 'Title, description, and subject are required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const moderationText = `${title}\n${description}`
    const moderation = detectAbusiveLanguage(moderationText)

    if (moderation.flagged) {
      await db.doubt.create({
        data: {
          userId: user.userId,
          title,
          description,
          subject,
          chapter: chapter || null,
          status: 'pending',
          isDeleted: true,
          deletedReason: `AI moderation removed content: ${moderation.matches.join(', ')}`,
          deletedAt: new Date(),
        },
      })

      const suspendedUntil = await suspendUserTemporarily(
        user.userId,
        'Abusive language in doubt submission'
      )

      return NextResponse.json(
        {
          error: 'Doubt removed by AI moderation due to abusive language.',
          code: 'SUSPENDED',
          suspendedUntil: suspendedUntil.toISOString(),
          moderated: true,
        },
        { status: 403 }
      )
    }

    const doubt = await db.doubt.create({
      data: {
        userId: user.userId,
        title,
        description,
        subject,
        chapter: chapter || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            suspendedUntil: true,
            suspensionReason: true,
          },
        },
      },
    })

    let aiReplyCreated = false
    try {
      const aiPrompt = [
        `Student doubt title: ${title}`,
        `Student doubt description: ${description}`,
        'Give a concise and clear JEE-focused explanation in 5-8 bullet points.',
        'End with one quick checkpoint question for the student.',
      ].join('\n')

      const aiResult = await routeAIQuery(aiPrompt, {
        userId: user.userId,
        subject,
        chapter: chapter || undefined,
        mode: 'friendly',
      })

      if (aiResult.modelUsed !== 'fallback' && aiResult.response.trim().length > 0) {
        await db.doubtReply.create({
          data: {
            doubtId: doubt.id,
            authorType: 'ai',
            authorName: 'AI Buddy',
            content: aiResult.response.trim(),
          },
        })

        await db.doubt.update({
          where: { id: doubt.id },
          data: { status: 'resolved' },
        })
        aiReplyCreated = true
      }
    } catch (error) {
      console.error('AI auto-reply error for doubt:', error)
    }

    return NextResponse.json({
      success: true,
      doubt: {
        id: doubt.id,
        title: doubt.title,
        description: doubt.description,
        subject: doubt.subject,
        chapter: doubt.chapter,
        status: aiReplyCreated ? 'resolved' : doubt.status,
        createdAt: doubt.createdAt,
        updatedAt: doubt.updatedAt,
        author: {
          id: doubt.user.id,
          name: doubt.user.name,
          role: doubt.user.role,
          suspendedUntil: doubt.user.suspendedUntil,
          suspensionReason: doubt.user.suspensionReason,
        },
        answerCount: aiReplyCreated ? 1 : 0,
      },
      aiReplyCreated,
    })
  })
}
