import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { withRole } from '@/lib/auth'
import { CLASS_DIRS, SUBJECT_DIRS, extractDriveFileId } from '@/lib/study-material'
import { readStudyMaterials, writeStudyMaterials } from '@/lib/study-material-store'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const formData = await request.formData()
    const classId = String(formData.get('classId') || '')
    const subject = String(formData.get('subject') || '')
    const title = String(formData.get('title') || '').trim()
    const driveUrl = String(formData.get('driveUrl') || '').trim()
    const sizeMbRaw = String(formData.get('sizeMb') || '').trim()

    if (!CLASS_DIRS.some(entry => entry.id === classId)) {
      return NextResponse.json({ error: 'Invalid class selection.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(SUBJECT_DIRS, subject)) {
      return NextResponse.json({ error: 'Invalid subject selection.' }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }

    if (!driveUrl) {
      return NextResponse.json({ error: 'Drive link is required.' }, { status: 400 })
    }

    const driveFileId = extractDriveFileId(driveUrl)
    const sizeMb = sizeMbRaw ? Number(sizeMbRaw) : null
    if (sizeMbRaw && (!Number.isFinite(sizeMb) || (sizeMb ?? 0) < 0)) {
      return NextResponse.json({ error: 'Size must be a valid number.' }, { status: 400 })
    }

    const stored = await readStudyMaterials()
    const newItem = {
      id: randomUUID(),
      title,
      classId: classId as (typeof CLASS_DIRS)[number]['id'],
      subject: subject as keyof typeof SUBJECT_DIRS,
      driveUrl,
      driveFileId,
      sizeMb: sizeMb ?? null,
      createdAt: new Date().toISOString(),
    }

    stored.unshift(newItem)
    await writeStudyMaterials(stored)

    return NextResponse.json({ ok: true, id: newItem.id })
  })
}
