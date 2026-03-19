import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withRole } from '@/lib/auth'
import { db } from '@/lib/db'

// Get available mock tests
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const { searchParams } = new URL(request.url)
    const testType = searchParams.get('testType') // chapter, subject, full
    const subject = searchParams.get('subject')
    const chapter = searchParams.get('chapter')
    const difficulty = searchParams.get('difficulty')

    const tests = await db.mockTest.findMany({
      where: {
        isActive: true,
        ...(testType && { testType }),
        ...(subject && { subject }),
        ...(chapter && { chapter }),
        ...(difficulty && { difficulty })
      },
      include: {
        _count: {
          select: { results: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Get user's attempts
    const userAttempts = await db.mockResult.findMany({
      where: { userId: user.userId },
      select: {
        testId: true,
        score: true,
        submittedAt: true
      }
    })

    const testsWithStatus = tests.map(test => ({
      ...test,
      attempted: userAttempts.some(a => a.testId === test.id),
      bestScore: userAttempts
        .filter(a => a.testId === test.id)
        .reduce((max, a) => Math.max(max, a.score), 0)
    }))

    return NextResponse.json({
      success: true,
      tests: testsWithStatus
    })
  })
}

export async function POST(request: NextRequest) {
  return withRole(request, ['admin', 'teacher'], async (user) => {
    try {
      const body = await request.json()
      const tests = Array.isArray(body?.tests) ? body.tests : null

      if (tests) {
        const prepared = tests.map((test: any) => {
          const questionIds = Array.isArray(test?.questionIds) ? test.questionIds : []
          return {
            title: String(test?.title || '').trim(),
            description: typeof test?.description === 'string' ? test.description : '',
            subject: typeof test?.subject === 'string' && test.subject ? test.subject : null,
            chapter: typeof test?.chapter === 'string' && test.chapter ? test.chapter : null,
            difficulty: typeof test?.difficulty === 'string' && test.difficulty ? test.difficulty : null,
            testType: String(test?.testType || 'full'),
            duration: Number(test?.duration || 0),
            totalMarks: Number(test?.totalMarks || 0),
            negativeMarking: Number(test?.negativeMarking || 0),
            questionIds: JSON.stringify(questionIds),
            instructions: typeof test?.instructions === 'string' ? test.instructions : '',
            createdBy: user.userId,
            isActive: true
          }
        }).filter((test: any) =>
          test.title &&
          test.testType &&
          test.duration > 0 &&
          test.totalMarks > 0 &&
          JSON.parse(test.questionIds).length > 0
        )

        if (prepared.length === 0) {
          return NextResponse.json(
            { error: 'No valid mock tests found in payload', code: 'VALIDATION_ERROR' },
            { status: 400 }
          )
        }

        const created = await db.mockTest.createMany({
          data: prepared
        })

        return NextResponse.json({
          success: true,
          created: created.count
        })
      }

      const {
        title,
        description,
        subject,
        chapter,
        difficulty,
        testType,
        duration,
        totalMarks,
        negativeMarking,
        questionIds,
        instructions
      } = body

      if (!title || !testType || !duration || !totalMarks || !Array.isArray(questionIds)) {
        return NextResponse.json(
          { error: 'Title, test type, duration, total marks and questionIds are required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const newTest = await db.mockTest.create({
        data: {
          title,
          description,
          subject: subject || null,
          chapter: chapter || null,
          difficulty: difficulty || null,
          testType,
          duration: Number(duration),
          totalMarks: Number(totalMarks),
          negativeMarking: Number(negativeMarking || 0),
          questionIds: JSON.stringify(questionIds),
          instructions: instructions || '',
          createdBy: user.userId,
          isActive: true
        }
      })

      return NextResponse.json({
        success: true,
        test: newTest
      })
    } catch (error) {
      console.error('Mock test creation error:', error)
      return NextResponse.json(
        { error: 'Failed to create mock tests', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
