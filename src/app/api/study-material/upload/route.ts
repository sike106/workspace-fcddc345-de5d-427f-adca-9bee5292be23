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

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const formData = await request.formData()
    const file = formData.get('file')
    const classId = String(formData.get('classId') || '')
    const subject = String(formData.get('subject') || '')

    if (!CLASS_DIRS.has(classId)) {
      return NextResponse.json({ error: 'Invalid class selection.' }, { status: 400 })
    }

    if (!Object.prototype.hasOwnProperty.call(SUBJECT_DIRS, subject)) {
      return NextResponse.json({ error: 'Invalid subject selection.' }, { status: 400 })
    }

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: 'PDF file missing.' }, { status: 400 })
    }

    const uploadedFile = file as File
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 })
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const safeName = sanitizeFileName(uploadedFile.name)
    const subjectDir = SUBJECT_DIRS[subject]
    const targetDir = path.join(process.cwd(), 'public', 'study-material', classId, subjectDir)
    await fs.mkdir(targetDir, { recursive: true })
    const targetPath = path.join(targetDir, safeName)
    await fs.writeFile(targetPath, buffer)

    return NextResponse.json({
      ok: true,
      path: `/study-material/${classId}/${subjectDir}/${safeName}`
    })
  })
}
