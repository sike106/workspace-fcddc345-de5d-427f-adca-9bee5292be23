import { NextResponse, type NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { withRole } from '@/lib/auth'

const CLASS_DIRS = new Set(['class-11', 'class-12', 'jee'])
const SUBJECT_DIRS: Record<string, string> = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Mathematics: 'mathematics'
}

function sanitizeFileName(name: string) {
  const trimmed = name.trim().replace(/[/\\\\]+/g, '_')
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return safe || `material-${Date.now()}.pdf`
}

function slugify(value: string) {
  const trimmed = value.trim().toLowerCase()
  const slug = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
  return slug || `material-${Date.now()}`
}

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const formData = await request.formData()
    const file = formData.get('file')
    const classId = String(formData.get('classId') || '')
    const subject = String(formData.get('subject') || '')
    const title = String(formData.get('title') || '').trim()

    if (!CLASS_DIRS.has(classId)) {
      return NextResponse.json({ error: 'Invalid class selection.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(SUBJECT_DIRS, subject)) {
      return NextResponse.json({ error: 'Invalid subject selection.' }, { status: 400 })
    }

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: 'PDF file missing.' }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }

    const uploadedFile = file as File
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 })
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const subjectDir = SUBJECT_DIRS[subject]
    const targetDir = path.join(process.cwd(), 'public', 'study-material', classId, subjectDir)
    await fs.mkdir(targetDir, { recursive: true })
    const baseSlug = slugify(title)
    let safeName = `${baseSlug}.pdf`
    let targetPath = path.join(targetDir, safeName)
    let attempt = 1

    while (true) {
      try {
        await fs.access(targetPath)
        attempt += 1
        safeName = `${baseSlug}-${attempt}.pdf`
        targetPath = path.join(targetDir, safeName)
      } catch {
        break
      }
    }

    await fs.writeFile(targetPath, buffer)
    const metaPath = path.join(targetDir, `${path.parse(safeName).name}.json`)
    await fs.writeFile(metaPath, JSON.stringify({ title }, null, 2))

    return NextResponse.json({
      ok: true,
      path: `/study-material/${classId}/${subjectDir}/${safeName}`
    })
  })
}
