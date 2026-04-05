import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { buildDriveLinks } from '@/lib/study-material'
import { readStudyMaterials } from '@/lib/study-material-store'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const url = new URL(request.url)
    const itemId = url.searchParams.get('itemId') || ''

    const userState = await db.user.findUnique({
      where: { id: user.userId },
      select: { isGuest: true },
    })

    if (!userState || userState.isGuest) {
      return NextResponse.json({ error: 'Login required to access study material.' }, { status: 403 })
    }

    if (!itemId) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }

    const items = await readStudyMaterials()
    const item = items.find(entry => entry.id === itemId)
    if (!item) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }

    const { viewUrl, downloadUrl } = buildDriveLinks(item.driveFileId || null, item.driveUrl)
    const mode = url.searchParams.get('mode') || 'download'
    const targetUrl = mode === 'view' ? viewUrl : downloadUrl
    if (!targetUrl) {
      return NextResponse.json({ error: 'Invalid file link.' }, { status: 400 })
    }

    return NextResponse.redirect(targetUrl)
  })
}
