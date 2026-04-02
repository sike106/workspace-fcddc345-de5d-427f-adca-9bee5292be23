import { NextResponse, type NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { withRole } from '@/lib/auth'
import { getR2Bucket, getR2Client } from '@/lib/r2'
import { buildMaterialKey, CLASS_DIRS, SUBJECT_DIRS, type Subject } from '@/lib/study-material'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    let payload: any = {}
    try {
      payload = await request.json()
    } catch {
      payload = {}
    }

    const classId = String(payload?.classId || '')
    const subject = String(payload?.subject || '')
    const title = String(payload?.title || '').trim()
    const fileName = String(payload?.fileName || '')
    const contentType = String(payload?.contentType || 'application/pdf')

    if (!CLASS_DIRS.some(entry => entry.id === classId)) {
      return NextResponse.json({ error: 'Invalid class selection.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(SUBJECT_DIRS, subject)) {
      return NextResponse.json({ error: 'Invalid subject selection.' }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }

    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 })
    }

    const key = buildMaterialKey({
      classId: classId as (typeof CLASS_DIRS)[number]['id'],
      subject: subject as Subject,
      title,
    })

    const client = getR2Client()
    const bucket = getR2Bucket()
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'application/pdf',
    })

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 10 })

    return NextResponse.json({
      ok: true,
      uploadUrl,
      key,
    })
  })
}
