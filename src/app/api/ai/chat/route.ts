import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { routeAIQuery, routeAIQueryStream, AIMode } from '@/lib/ai-router'
import { db } from '@/lib/db'
import { GUEST_AI_TUTOR_RESPONSE_LIMIT } from '@/lib/guest-config'

const GUEST_AI_MESSAGE_LIMIT = GUEST_AI_TUTOR_RESPONSE_LIMIT

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const { message, subject, chapter, mode = 'exam', stream = false, sessionStartedAt } = body

      if (!message || typeof message !== 'string') {
        return NextResponse.json(
          { error: 'Message is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      let sessionStartDate: Date | null = null
      if (typeof sessionStartedAt !== 'undefined') {
        if (typeof sessionStartedAt !== 'number' || !Number.isFinite(sessionStartedAt)) {
          return NextResponse.json(
            { error: 'Invalid sessionStartedAt', code: 'VALIDATION_ERROR' },
            { status: 400 }
          )
        }

        sessionStartDate = new Date(sessionStartedAt)
        if (Number.isNaN(sessionStartDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid sessionStartedAt', code: 'VALIDATION_ERROR' },
            { status: 400 }
          )
        }
      }

      // Validate mode
      const validModes: AIMode[] = ['strict', 'friendly', 'exam']
      const selectedMode = validModes.includes(mode) ? mode : 'exam'

      const userState = await db.user.findUnique({
        where: { id: user.userId },
        select: { id: true, isGuest: true },
      })

      if (!userState) {
        return NextResponse.json(
          { error: 'Invalid user session', code: 'INVALID_TOKEN' },
          { status: 401 }
        )
      }

      if (userState.isGuest) {
        const usedMessages = await db.aIHistory.count({
          where: { userId: user.userId },
        })

        if (usedMessages >= GUEST_AI_MESSAGE_LIMIT) {
          return NextResponse.json(
            {
              error:
                'You have used all guest AI Buddy replies. Please log in to continue with unlimited personalized mentoring.',
              code: 'GUEST_AI_TUTOR_LIMIT',
              limit: GUEST_AI_MESSAGE_LIMIT,
              used: usedMessages,
            },
            { status: 403 }
          )
        }
      }

      // Get recent conversation history for context
      const history = await db.aIHistory.findMany({
        where: { 
          userId: user.userId,
          ...(subject && { subject }),
          ...(chapter && { chapter }),
          ...(sessionStartDate && { createdAt: { gte: sessionStartDate } })
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          userMessage: true,
          aiResponse: true
        }
      })

      const conversationHistory = history.reverse().map(h => [
        { role: 'user' as const, content: h.userMessage },
        { role: 'assistant' as const, content: h.aiResponse }
      ]).flat()

      const acceptHeader = request.headers.get('accept') || ''
      const wantsStream = stream === true || acceptHeader.includes('text/event-stream')

      if (wantsStream) {
        const encoder = new TextEncoder()
        const sse = new ReadableStream({
          start: async (controller) => {
            const send = (payload: Record<string, any>) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
            }

            try {
              const result = await routeAIQueryStream(
                message,
                {
                  userId: user.userId,
                  subject,
                  chapter,
                  mode: selectedMode,
                  conversationHistory,
                },
                {
                  onDelta: (delta) => send({ type: 'delta', content: delta }),
                  onThinking: (thinking) => send({ type: 'thinking', content: thinking }),
                }
              )

              send({
                type: 'done',
                modelUsed: result.modelUsed,
                tokensUsed: result.tokensUsed,
              })
            } catch (error) {
              console.error('AI chat stream error:', error)
              send({ type: 'error', error: 'Failed to process AI request' })
            } finally {
              controller.close()
            }
          },
        })

        return new NextResponse(sse, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      }

      // Route to AI
      const result = await routeAIQuery(message, {
        userId: user.userId,
        subject,
        chapter,
        mode: selectedMode,
        conversationHistory
      })

      return NextResponse.json({
        success: true,
        response: result.response,
        modelUsed: result.modelUsed,
        tokensUsed: result.tokensUsed
      })
    } catch (error) {
      console.error('AI chat error:', error)
      return NextResponse.json(
        { error: 'Failed to process AI request', code: 'AI_ERROR' },
        { status: 500 }
      )
    }
  })
}

// Get AI chat history
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const { searchParams } = new URL(request.url)
    const subject = searchParams.get('subject')
    const chapter = searchParams.get('chapter')
    const limit = parseInt(searchParams.get('limit') || '50')

    const history = await db.aIHistory.findMany({
      where: {
        userId: user.userId,
        ...(subject && { subject }),
        ...(chapter && { chapter })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        subject: true,
        chapter: true,
        mode: true,
        userMessage: true,
        aiResponse: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      success: true,
      history: history.reverse()
    })
  })
}
