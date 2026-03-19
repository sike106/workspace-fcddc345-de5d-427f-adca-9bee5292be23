import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { db } from '@/lib/db'

// Get all questions (for teacher management)
export async function GET(request: NextRequest) {
  return withRole(request, ['teacher', 'admin'], async () => {
    const { searchParams } = new URL(request.url)
    const subject = (searchParams.get('subject') || '').trim()
    const exam = (searchParams.get('exam') || '').trim()
    const limitRaw = searchParams.get('limit')
    let limitValue: number | null = 100
    if (limitRaw) {
      limitValue = ['all', '0', '-1'].includes(limitRaw)
        ? null
        : Number.parseInt(limitRaw, 10)
    }
    const limit = Number.isFinite(limitValue) && limitValue && limitValue > 0 ? limitValue : null

    const questions = await db.question.findMany({
      where: {
        ...(subject ? { subject } : {}),
        ...(exam ? { pyqType: exam } : {}),
      },
      ...(limit ? { take: limit } : {}),
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      questions
    })
  })
}

export async function DELETE(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const all = body?.all === true
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((item: any) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : []
    const exam = typeof body?.exam === 'string' ? body.exam.trim() : ''

    try {
      if (all) {
        const deleted = await db.question.deleteMany({})
        return NextResponse.json({ success: true, deleted: deleted.count })
      }

      if (ids.length > 0) {
        const deleted = await db.question.deleteMany({
          where: { id: { in: ids } }
        })
        return NextResponse.json({ success: true, deleted: deleted.count })
      }

      if (id) {
        await db.question.delete({ where: { id } })
        return NextResponse.json({ success: true, deleted: 1 })
      }

      if (exam) {
        const deleted = exam === '__unassigned__'
          ? await db.question.deleteMany({
              where: {
                OR: [{ pyqType: null }, { pyqType: '' }]
              }
            })
          : await db.question.deleteMany({ where: { pyqType: exam } })
        return NextResponse.json({ success: true, deleted: deleted.count })
      }

      return NextResponse.json(
        { error: 'Delete target is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    } catch (error) {
      console.error('Question delete error:', error)
      return NextResponse.json(
        { error: 'Failed to delete questions', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}

// Create new question
export async function POST(request: NextRequest) {
  return withRole(request, ['teacher', 'admin'], async (user) => {
    try {
      const body = await request.json()
      const {
        subject,
        chapter,
        difficulty,
        type,
        question,
        options,
        correctAnswer,
        solution,
        hint,
        explanation,
        alternateApproach,
        pyqYear,
        pyqType
      } = body

      if (!subject || !chapter || !question || !correctAnswer) {
        return NextResponse.json(
          { error: 'Subject, chapter, question, and correct answer are required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const newQuestion = await db.question.create({
        data: {
          subject,
          chapter,
          difficulty: difficulty || 'Medium',
          type: type || 'single',
          question,
          options: options ? JSON.stringify(options) : null,
          correctAnswer,
          solution,
          hint,
          explanation,
          alternateApproach,
          pyqYear,
          pyqType,
          createdBy: user.userId
        }
      })

      return NextResponse.json({
        success: true,
        question: newQuestion
      })
    } catch (error) {
      console.error('Question creation error:', error)
      return NextResponse.json(
        { error: 'Failed to create question', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
