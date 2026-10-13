import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const { searchParams } = new URL(request.url)
    const limitRaw = Number.parseInt(searchParams.get('limit') || '200', 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200

    const rows = await db.adminChatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
      },
    })

    const messages = rows.reverse().map(row => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      sender: {
        id: row.user.id,
        name: row.user.name,
        role: row.user.role,
      },
    }))

    return NextResponse.json({ success: true, messages })
  })
}

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async (user) => {
    const body = await request.json().catch(() => ({}))
    const content = typeof body?.content === 'string' ? body.content.trim() : ''

    if (!content) {
      return NextResponse.json(
        { error: 'Message content is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const created = await db.adminChatMessage.create({
      data: {
        userId: user.userId,
        content,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    })

    return NextResponse.json({
      success: true,
      message: {
        id: created.id,
        content: created.content,
        createdAt: created.createdAt.toISOString(),
        sender: {
          id: created.user.id,
          name: created.user.name,
          role: created.user.role,
        },
      },
    })
  })
}
