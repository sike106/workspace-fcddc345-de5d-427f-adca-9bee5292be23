import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'

// Start a mock test
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const { testId } = body

      if (!testId) {
        return NextResponse.json(
          { error: 'Test ID is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      // Get test details
      const test = await db.mockTest.findUnique({
        where: { id: testId }
      })

      if (!test) {
        return NextResponse.json(
          { error: 'Test not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }

      // Check for existing in-progress attempt
      const existingAttempt = await db.testAttempt.findFirst({
        where: {
          testId,
          userId: user.userId,
          status: 'in_progress'
        }
      })

      if (existingAttempt) {
        // Return existing attempt
        const questionIds = JSON.parse(test.questionIds)
        const questions = await db.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true,
            subject: true,
            chapter: true,
            difficulty: true,
            type: true,
            question: true,
            options: true
          }
        })

        // Sort questions in original order
        const sortedQuestions = questionIds.map((id: string) => 
          questions.find(q => q.id === id)
        ).filter(Boolean)

        return NextResponse.json({
          success: true,
          test: {
            ...test,
            questions: sortedQuestions
          },
          attempt: existingAttempt,
          resumed: true
        })
      }

      // Create new attempt
      const attempt = await db.testAttempt.create({
        data: {
          testId,
          userId: user.userId,
          status: 'in_progress',
          answers: '{}',
          currentQuestion: 0
        }
      })

      // Get questions
      const questionIds = JSON.parse(test.questionIds)
      const questions = await db.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          subject: true,
          chapter: true,
          difficulty: true,
          type: true,
          question: true,
          options: true
        }
      })

      // Sort questions in original order
      const sortedQuestions = questionIds.map((id: string) => 
        questions.find(q => q.id === id)
      ).filter(Boolean)

      return NextResponse.json({
        success: true,
        test: {
          ...test,
          questions: sortedQuestions
        },
        attempt,
        resumed: false
      })
    } catch (error) {
      console.error('Mock test start error:', error)
      return NextResponse.json(
        { error: 'Failed to start test', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
