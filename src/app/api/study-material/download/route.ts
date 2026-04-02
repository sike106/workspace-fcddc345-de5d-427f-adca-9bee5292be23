import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'stream'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getDriveClient } from '@/lib/gdrive'
import { toTitleCase } from '@/lib/study-material'

export const runtime = 'nodejs'
export const maxDuration = 60

function sanitizeFilename(value: string) {
  const trimmed = value.trim().replace(/[^a-zA-Z0-9._ -]+/g, '')
  return trimmed || 'study-material'
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const url = new URL(request.url)
    const fileId = url.searchParams.get('fileId') || ''

    const userState = await db.user.findUnique({
      where: { id: user.userId },
      select: { isGuest: true },
    })

    if (!userState || userState.isGuest) {
      return NextResponse.json({ error: 'Login required to access study material.' }, { status: 403 })
    }

    if (!fileId) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }

    const mode = url.searchParams.get('mode') || 'download'
    const disposition = mode === 'view' ? 'inline' : 'attachment'
    const drive = getDriveClient()
    const meta = await drive.files.get({
      fileId,
      fields: 'name, appProperties, mimeType',
      supportsAllDrives: true,
    })

    const rawTitle =
      (meta.data.appProperties?.title as string | undefined) || meta.data.name || 'study-material'
    const safeTitle = sanitizeFilename(toTitleCase(rawTitle.replace(/\.pdf$/i, '')))
    const responseContentDisposition = `${disposition}; filename="${safeTitle}.pdf"`
    const contentType = meta.data.mimeType || 'application/pdf'

    const fileStreamResponse = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    )

    const nodeStream = fileStreamResponse.data as unknown as NodeJS.ReadableStream
    const body = Readable.toWeb(nodeStream)

    return new NextResponse(body as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': responseContentDisposition,
      },
    })
  })
}
