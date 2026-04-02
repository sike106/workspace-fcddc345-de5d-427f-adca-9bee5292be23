import { NextResponse, type NextRequest } from 'next/server'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getR2Bucket, getR2Client } from '@/lib/r2'
import { MATERIAL_PREFIX, parseMaterialKey } from '@/lib/study-material'

export const revalidate = 0
export const runtime = 'nodejs'

type MaterialItem = {
  title: string
  subject: 'Physics' | 'Chemistry' | 'Mathematics'
  key: string
  classId: 'class-11' | 'class-12' | 'jee'
  size: number
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

    const client = getR2Client()
    const bucket = getR2Bucket()
    const items: MaterialItem[] = []
    let continuationToken: string | undefined

    do {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${MATERIAL_PREFIX}/`,
          ContinuationToken: continuationToken,
        })
      )

      for (const entry of result.Contents ?? []) {
        if (!entry.Key) continue
        const parsed = parseMaterialKey(entry.Key)
        if (!parsed) continue
        items.push({
          title: parsed.title,
          subject: parsed.subject,
          classId: parsed.classId,
          key: parsed.key,
          size: entry.Size ?? 0,
        })
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined
    } while (continuationToken)

    return NextResponse.json({ items })
  })
}
