import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'

// Save progress during test
export async function PUT(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const { attemptId, answers, currentQuestion } = body

      await db.testAttempt.update({
        where: { id: attemptId, userId: user.userId },
        data: {
          answers: JSON.stringify(answers),
          currentQuestion: currentQuestion || 0,
          lastActivity: new Date()
        }
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Save progress error:', error)
      return NextResponse.json(
        { error: 'Failed to save progress', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}

// Submit mock test
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json()
      const { attemptId, answers, timeTaken } = body

      if (!attemptId) {
        return NextResponse.json(
          { error: 'Attempt ID is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      // Get attempt and test
      const attempt = await db.testAttempt.findUnique({
        where: { id: attemptId, userId: user.userId },
        include: { test: true }
      })

      if (!attempt) {
        return NextResponse.json(
          { error: 'Attempt not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }

      // Get questions
      const questionIds = JSON.parse(attempt.test.questionIds)
      const questions = await db.question.findMany({
        where: { id: { in: questionIds } }
      })

      // Calculate score
      let correct = 0
      let incorrect = 0
      const detailedResults: any[] = []

      for (const question of questions) {
        const userAnswer = answers[question.id]
        
        if (userAnswer === undefined || userAnswer === null || userAnswer === '') {
          detailedResults.push({
            questionId: question.id,
            correct: false,
            unattempted: true
          })
        } else if (userAnswer.toString() === question.correctAnswer) {
          correct++
          detailedResults.push({
            questionId: question.id,
            correct: true,
            unattempted: false
          })
        } else {
          incorrect++
          detailedResults.push({
            questionId: question.id,
            correct: false,
            unattempted: false,
            userAnswer,
            correctAnswer: question.correctAnswer
          })
        }
      }

      const unattempted = questions.length - correct - incorrect
      
      // Calculate score with negative marking
      const positiveMarks = 4 // per correct answer
      const negativeMarks = attempt.test.negativeMarking // per incorrect answer
      const score = (correct * positiveMarks) - (incorrect * negativeMarks)

      // Save result
      const result = await db.mockResult.create({
        data: {
          testId: attempt.testId,
          userId: user.userId,
          answers: JSON.stringify(answers),
          score: Math.max(0, score),
          correct,
          incorrect,
          unattempted,
          timeTaken: timeTaken || 0,
          analysis: JSON.stringify(detailedResults)
        }
      })

      // Mark attempt as submitted
      await db.testAttempt.update({
        where: { id: attemptId },
        data: { status: 'submitted' }
      })

      return NextResponse.json({
        success: true,
        result: {
          id: result.id,
          score: Math.max(0, score),
          correct,
          incorrect,
          unattempted,
          totalQuestions: questions.length,
          percentage: Math.round((correct / questions.length) * 100),
          detailedResults
        }
      })
    } catch (error) {
      console.error('Mock submit error:', error)
      return NextResponse.json(
        { error: 'Failed to submit test', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
