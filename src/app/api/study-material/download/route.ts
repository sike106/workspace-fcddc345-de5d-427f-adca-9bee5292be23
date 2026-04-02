import { NextResponse, type NextRequest } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getR2Bucket, getR2Client } from '@/lib/r2'
import { MATERIAL_PREFIX, parseMaterialKey } from '@/lib/study-material'

export const runtime = 'nodejs'
export const maxDuration = 60

function sanitizeFilename(value: string) {
  const trimmed = value.trim().replace(/[^a-zA-Z0-9._ -]+/g, '')
  return trimmed || 'study-material'
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const url = new URL(request.url)
    const rawKey = url.searchParams.get('key') || ''
    const key = rawKey.replace(/^\/+/, '')

    if (!key || !key.startsWith(`${MATERIAL_PREFIX}/`) || key.includes('..')) {
      return NextResponse.json({ error: 'Invalid file reference.' }, { status: 400 })
    }

    const userState = await db.user.findUnique({
      where: { id: user.userId },
      select: { isGuest: true },
    })

    if (!userState || userState.isGuest) {
      return NextResponse.json({ error: 'Login required to access study material.' }, { status: 403 })
    }

    const parsed = parseMaterialKey(key)
    if (!parsed) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }

    const mode = url.searchParams.get('mode') || 'download'
    const disposition = mode === 'view' ? 'inline' : 'attachment'
    const safeTitle = sanitizeFilename(parsed.title)
    const responseContentDisposition = `${disposition}; filename="${safeTitle}.pdf"`

    const client = getR2Client()
    const bucket = getR2Bucket()
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: parsed.key,
      ResponseContentDisposition: responseContentDisposition,
      ResponseContentType: 'application/pdf',
    })

    const signedUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 })
    return NextResponse.redirect(signedUrl)
  })
}
