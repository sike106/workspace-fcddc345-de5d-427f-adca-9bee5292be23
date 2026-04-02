import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'stream'
import { withRole } from '@/lib/auth'
import { getDriveClient, getDriveFolderId } from '@/lib/gdrive'
import { CLASS_DIRS, SUBJECT_DIRS, slugifyTitle } from '@/lib/study-material'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const formData = await request.formData()
    const file = formData.get('file')
    const classId = String(formData.get('classId') || '')
    const subject = String(formData.get('subject') || '')
    const title = String(formData.get('title') || '').trim()

    if (!CLASS_DIRS.some(entry => entry.id === classId)) {
      return NextResponse.json({ error: 'Invalid class selection.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(SUBJECT_DIRS, subject)) {
      return NextResponse.json({ error: 'Invalid subject selection.' }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: 'PDF file missing.' }, { status: 400 })
    }

    const uploadedFile = file as File
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 })
    }

    const safeName = `${Date.now()}-${slugifyTitle(title)}.pdf`
    const buffer = Buffer.from(await uploadedFile.arrayBuffer())

    const drive = getDriveClient()
    const folderId = getDriveFolderId()
    const response = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [folderId],
        appProperties: {
          classId,
          subject,
          title,
        },
      },
      media: {
        mimeType: uploadedFile.type || 'application/pdf',
        body: Readable.from(buffer),
      },
      fields: 'id, size',
      supportsAllDrives: true,
    })

    return NextResponse.json({
      ok: true,
      fileId: response.data.id,
      size: response.data.size || null,
    })
  })
}
