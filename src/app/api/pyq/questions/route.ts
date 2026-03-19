import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, withRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const { searchParams } = new URL(request.url)
    const exam = searchParams.get('exam')
    const subject = searchParams.get('subject')
    const chapter = searchParams.get('chapter')
    const difficulty = searchParams.get('difficulty')
    const yearRaw = searchParams.get('year')
    const year = yearRaw ? parseInt(yearRaw, 10) : undefined

    const where: any = {
      isActive: true,
      ...(exam ? { pyqType: exam } : { pyqType: { not: null } }),
      ...(subject && { subject }),
      ...(chapter && { chapter }),
      ...(difficulty && { difficulty }),
      ...(year ? { pyqYear: year } : {})
    }

    let questions = await db.question.findMany({
      where,
      select: {
        id: true,
        subject: true,
        chapter: true,
        difficulty: true,
        type: true,
        question: true,
        options: true,
        pyqYear: true,
        pyqType: true,
        correctAnswer: true,
        solution: true,
        explanation: true,
        alternateApproach: true
      }
    })

    if (questions.length > 1) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[questions[i], questions[j]] = [questions[j], questions[i]]
      }
    }

    return NextResponse.json({
      success: true,
      questions,
      count: questions.length
    })
  })
}

export async function POST(request: NextRequest) {
  return withRole(request, ['admin', 'teacher'], async (user) => {
    try {
      const body = await request.json()
      const bulkQuestions = Array.isArray(body?.questions) ? body.questions : null

      if (bulkQuestions) {
        const prepared = bulkQuestions.map((item: any) => {
          const options = Array.isArray(item?.options) ? item.options : []
          return {
            subject: String(item?.subject || '').trim(),
            chapter: String(item?.chapter || '').trim(),
            difficulty: String(item?.difficulty || 'Medium'),
            type: 'single',
            question: String(item?.question || '').trim(),
            options: options.length > 0 ? JSON.stringify(options) : null,
            correctAnswer: String(item?.correctAnswer ?? '').trim(),
            solution: typeof item?.solution === 'string' ? item.solution : '',
            explanation: typeof item?.explanation === 'string' ? item.explanation : '',
            alternateApproach: typeof item?.alternateApproach === 'string' ? item.alternateApproach : '',
            pyqType: String(item?.exam || item?.pyqType || '').trim(),
            pyqYear: item?.year ? parseInt(String(item.year), 10) : undefined,
            tags: JSON.stringify(['pyq', String(item?.exam || item?.pyqType || '').trim()]),
            createdBy: user.userId,
            isActive: true
          }
        }).filter((item: any) =>
          item.subject &&
          item.chapter &&
          item.question &&
          item.correctAnswer !== '' &&
          item.pyqType
        )

        if (prepared.length === 0) {
          return NextResponse.json(
            { error: 'No valid PYQs found in payload', code: 'VALIDATION_ERROR' },
            { status: 400 }
          )
        }

        const created = await db.question.createMany({
          data: prepared
        })

        return NextResponse.json({
          success: true,
          created: created.count
        })
      }
      const {
        exam,
        year,
        subject,
        chapter,
        difficulty = 'Medium',
        question,
        options,
        correctAnswer,
        solution,
        explanation,
        alternateApproach
      } = body

      if (!exam || !subject || !chapter || !question || correctAnswer === undefined) {
        return NextResponse.json(
          { error: 'Exam, subject, chapter, question, and correct answer are required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const parsedYear = year ? parseInt(String(year), 10) : undefined
      const optionArray = Array.isArray(options) ? options : []

      const newQuestion = await db.question.create({
        data: {
          subject,
          chapter,
          difficulty,
          type: 'single',
          question,
          options: optionArray.length > 0 ? JSON.stringify(optionArray) : null,
          correctAnswer: String(correctAnswer),
          solution,
          explanation,
          alternateApproach,
          pyqType: exam,
          pyqYear: parsedYear,
          tags: JSON.stringify(['pyq', exam]),
          createdBy: user.userId,
          isActive: true
        }
      })

      return NextResponse.json({
        success: true,
        question: newQuestion
      })
    } catch (error) {
      console.error('PYQ create error:', error)
      return NextResponse.json(
        { error: 'Failed to create PYQ question', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
