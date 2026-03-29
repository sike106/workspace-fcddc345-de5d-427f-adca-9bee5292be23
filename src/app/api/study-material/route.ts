import { NextResponse, type NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

export const revalidate = 0

const CLASS_DIRS = [
  { id: 'class-11', label: 'Class 11' },
  { id: 'class-12', label: 'Class 12' },
  { id: 'jee', label: 'JEE' }
] as const

const SUBJECT_DIRS = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Mathematics: 'mathematics'
} as const

type Subject = keyof typeof SUBJECT_DIRS
type ClassId = typeof CLASS_DIRS[number]['id']

type MaterialItem = {
  title: string
  subject: Subject
  pdf: string
  classId: ClassId
}

function toTitleCase(value: string) {
  return value
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

async function listPdfFiles(dir: string) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase().endsWith('.pdf'))
  } catch {
    return []
  }
}

export async function GET(_request: NextRequest) {
  const baseDir = path.join(process.cwd(), 'public', 'study-material')
  const items: MaterialItem[] = []

  for (const classDir of CLASS_DIRS) {
    for (const [subject, subjectDir] of Object.entries(SUBJECT_DIRS) as [Subject, string][]) {
      const fullPath = path.join(baseDir, classDir.id, subjectDir)
      const files = await listPdfFiles(fullPath)

      for (const file of files) {
        items.push({
          title: toTitleCase(file),
          subject,
          classId: classDir.id,
          pdf: `/study-material/${classDir.id}/${subjectDir}/${file}`
        })
      }
    }
  }

  return NextResponse.json({ items })
}
