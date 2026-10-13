import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { generatePracticeQuestions } from '@/lib/ai-router'
import {
  getUserGuestState,
  getGuestAiFeatureUsage,
  guestAiFeatureLimitResponse,
  incrementGuestAiFeatureUsage,
} from '@/lib/guest-ai-limits'
import { GUEST_AI_FEATURE_LIMIT } from '@/lib/guest-config'

// Get questions for practice
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const { searchParams } = new URL(request.url)
    const subject = (searchParams.get('subject') || '').trim()
    const chapter = (searchParams.get('chapter') || '').trim()
    const difficulty = (searchParams.get('difficulty') || '').trim()
    const limit = parseInt(searchParams.get('limit') || '10')
    const REPEAT_COOLDOWN_DAYS = 60
    const cutoff = new Date(Date.now() - REPEAT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)

    const recentHistory = await db.practiceQuestionHistory.findMany({
      where: {
        userId: user.userId,
        lastServed: { gte: cutoff }
      },
      select: { questionId: true }
    })
    const recentIds = recentHistory.map(item => item.questionId)

    const baseWhere = {
      isActive: true,
      ...(subject ? { subject } : {}),
      ...(chapter ? { chapter } : {}),
      ...(difficulty ? { difficulty } : {})
    }
    const allowAi = searchParams.get('allowAi') !== 'false'
    const preferAi = searchParams.get('preferAi') === 'true'
    let userState: { id: string; isGuest: boolean } | null = null
    let aiBlockedByLimit = false
    let aiUsageCount = 0
    let aiAttempted = false
    let aiError: string | null = null

    const fetchDbQuestions = async () => {
      const where = recentIds.length > 0
        ? { ...baseWhere, id: { notIn: recentIds } }
        : baseWhere

      const eligibleIds = await db.question.findMany({
        where,
        select: { id: true }
      })

      const shuffledIds = eligibleIds.map(item => item.id)
      for (let i = shuffledIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]]
      }
      const selectedIds = shuffledIds.slice(0, limit)

      let items = selectedIds.length > 0
        ? await db.question.findMany({
            where: { id: { in: selectedIds } },
            select: {
              id: true,
              subject: true,
              chapter: true,
              difficulty: true,
              type: true,
              question: true,
              options: true,
              pyqYear: true,
              pyqType: true
              // Don't return answer!
            }
          })
        : []

      if (items.length > 0) {
        const questionMap = new Map(items.map(question => [question.id, question]))
        items = selectedIds.map(id => questionMap.get(id)).filter(Boolean) as typeof items
      }

      return items
    }

    const tryGenerateAi = async () => {
      aiAttempted = true
      userState = await getUserGuestState(user.userId)
      if (!userState) {
        return {
          error: NextResponse.json(
            { error: 'Invalid user session', code: 'INVALID_TOKEN' },
            { status: 401 }
          )
        }
      }

      if (userState.isGuest) {
        const used = await getGuestAiFeatureUsage(user.userId)
        aiUsageCount = used
        if (used >= GUEST_AI_FEATURE_LIMIT) {
          aiBlockedByLimit = true
          return { questions: [] }
        }
      }

      let generated: any[] = []
      try {
        generated = await generatePracticeQuestions(
          subject || 'General',
          chapter || 'Mixed',
          difficulty || 'Medium',
          Math.min(limit, 5),
          user.userId,
          { throwOnError: true }
        )
      } catch (error: any) {
        aiError = typeof error?.message === 'string' && error.message.trim()
          ? error.message.trim()
          : 'AI provider request failed'
        return { questions: [] }
      }

      if (generated.length === 0) {
        return { questions: [] }
      }

      const created: any[] = []
      for (const item of generated) {
        const targetSubject = subject || item.subject
        const targetChapter = chapter || item.chapter
        const targetDifficulty = difficulty || item.difficulty

        const createdQuestion = await db.question.create({
          data: {
            subject: targetSubject,
            chapter: targetChapter,
            difficulty: targetDifficulty,
            type: item.type,
            question: item.question,
            options: JSON.stringify(item.options),
            correctAnswer: item.correctAnswer,
            solution: item.solution,
            hint: item.hint,
            explanation: item.explanation,
            tags: JSON.stringify(['ai-generated']),
            createdBy: user.userId,
            isActive: true
          },
          select: {
            id: true,
            subject: true,
            chapter: true,
            difficulty: true,
            type: true,
            question: true,
            options: true,
            pyqYear: true,
            pyqType: true
          }
        })
        created.push(createdQuestion)
      }

      if (userState.isGuest) {
        await incrementGuestAiFeatureUsage(user.userId)
      }

      return { questions: created }
    }

    let questions: any[] = []
    let source: 'db' | 'ai' | 'none' = 'none'

    if (preferAi && allowAi) {
      const aiResult = await tryGenerateAi()
      if (aiResult?.error) return aiResult.error
      if (aiResult?.questions?.length) {
        questions = aiResult.questions
        source = 'ai'
      }
    }

    if (questions.length === 0) {
      questions = await fetchDbQuestions()
      source = questions.length > 0 ? 'db' : 'none'
    }

    if (questions.length === 0 && allowAi && !preferAi) {
      const aiResult = await tryGenerateAi()
      if (aiResult?.error) return aiResult.error
      if (aiResult?.questions?.length) {
        questions = aiResult.questions
        source = 'ai'
      } else if (aiBlockedByLimit) {
        return guestAiFeatureLimitResponse(aiUsageCount)
      }
    } else if (questions.length === 0 && aiBlockedByLimit) {
      return guestAiFeatureLimitResponse(aiUsageCount)
    }

    if (questions.length > 0) {
      const now = new Date()
      await Promise.all(
        questions.map(question =>
          db.practiceQuestionHistory.upsert({
            where: { userId_questionId: { userId: user.userId, questionId: question.id } },
            update: { lastServed: now, servedCount: { increment: 1 } },
            create: { userId: user.userId, questionId: question.id, lastServed: now }
          })
        )
      )
    }

    return NextResponse.json({
      success: true,
      questions,
      count: questions.length,
      source,
      cooldownDays: REPEAT_COOLDOWN_DAYS,
      aiAttempted,
      aiError
    })
  })
}

// Submit answer for a practice question
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const { questionId, answer, timeTaken } = body

      if (!questionId || answer === undefined) {
        return NextResponse.json(
          { error: 'Question ID and answer are required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      // Get the question
      const question = await db.question.findUnique({
        where: { id: questionId }
      })

      if (!question) {
        return NextResponse.json(
          { error: 'Question not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }

      // Check answer
      const isCorrect = question.correctAnswer === answer.toString()

      // Update progress
      const existingProgress = await db.progress.findUnique({
        where: {
          userId_subject_chapter: {
            userId: user.userId,
            subject: question.subject,
            chapter: question.chapter
          }
        }
      })

      if (existingProgress) {
        await db.progress.update({
          where: { id: existingProgress.id },
          data: {
            questionsSolved: { increment: 1 },
            correctAnswers: { increment: isCorrect ? 1 : 0 },
            totalTime: { increment: timeTaken || 0 },
            lastPracticed: new Date(),
            accuracy: ((existingProgress.correctAnswers + (isCorrect ? 1 : 0)) / 
                       (existingProgress.questionsSolved + 1)) * 100
          }
        })
      } else {
        await db.progress.create({
          data: {
            userId: user.userId,
            subject: question.subject,
            chapter: question.chapter,
            questionsSolved: 1,
            correctAnswers: isCorrect ? 1 : 0,
            totalTime: timeTaken || 0,
            accuracy: isCorrect ? 100 : 0,
            lastPracticed: new Date()
          }
        })
      }

      return NextResponse.json({
        success: true,
        isCorrect,
        correctAnswer: question.correctAnswer,
        solution: question.solution,
        explanation: question.explanation
      })
    } catch (error) {
      console.error('Practice submit error:', error)
      return NextResponse.json(
        { error: 'Failed to submit answer', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
