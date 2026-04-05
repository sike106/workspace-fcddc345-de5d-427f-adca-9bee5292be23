import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { readStudyMaterials } from '@/lib/study-material-store'

export const revalidate = 0
export const runtime = 'nodejs'

type MaterialItem = {
  title: string
  subject: 'Physics' | 'Chemistry' | 'Mathematics'
  id: string
  classId: 'class-11' | 'class-12' | 'jee'
  size?: number | null
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const userState = await db.user.findUnique({
      where: { id: user.userId },
      select: { isGuest: true },
    })

    if (!userState || userState.isGuest) {
      return NextResponse.json(
        { error: 'Login required to access study material.' },
        { status: 403 }
      )
    }

    const stored = await readStudyMaterials()
    const items: MaterialItem[] = stored.map(item => ({
      id: item.id,
      title: item.title,
      subject: item.subject,
      classId: item.classId,
      size: item.sizeMb ? Math.round(item.sizeMb * 1024 * 1024) : null,
    }))

    return NextResponse.json({ items })
  })
}
