import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getDriveClient, getDriveFolderId } from '@/lib/gdrive'
import { CLASS_DIRS, SUBJECT_DIRS, toTitleCase } from '@/lib/study-material'

export const revalidate = 0
export const runtime = 'nodejs'

type MaterialItem = {
  title: string
  subject: 'Physics' | 'Chemistry' | 'Mathematics'
  fileId: string
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

    const drive = getDriveClient()
    const folderId = getDriveFolderId()
    const items: MaterialItem[] = []
    let pageToken: string | undefined

    const validClassIds = new Set(CLASS_DIRS.map(entry => entry.id))
    const validSubjects = new Set(Object.keys(SUBJECT_DIRS))

    do {
      const result = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and mimeType='application/pdf'`,
        fields: 'nextPageToken, files(id, name, size, appProperties)',
        pageToken,
        pageSize: 200,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

      for (const file of result.data.files ?? []) {
        if (!file.id) continue
        const appProps = file.appProperties || {}
        const classId = String(appProps.classId || '')
        const subject = String(appProps.subject || '')
        if (!validClassIds.has(classId) || !validSubjects.has(subject)) {
          continue
        }

        const title = String(appProps.title || '') || toTitleCase(file.name || 'Study Material')
        items.push({
          title,
          subject: subject as MaterialItem['subject'],
          classId: classId as MaterialItem['classId'],
          fileId: file.id,
          size: typeof file.size === 'string' ? Number(file.size) : Number(file.size || 0),
        })
      }

      pageToken = result.data.nextPageToken || undefined
    } while (pageToken)

    return NextResponse.json({ items })
  })
}
