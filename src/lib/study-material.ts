export const CLASS_DIRS = [
  { id: 'class-11', label: 'Class 11' },
  { id: 'class-12', label: 'Class 12' },
  { id: 'jee', label: 'JEE' },
] as const

export const SUBJECT_DIRS = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Mathematics: 'mathematics',
} as const

export const MATERIAL_PREFIX = 'study-material'

export type Subject = keyof typeof SUBJECT_DIRS
export type ClassId = (typeof CLASS_DIRS)[number]['id']

const SUBJECT_DIR_LOOKUP: Record<string, Subject | undefined> = Object.entries(SUBJECT_DIRS).reduce(
  (acc, [label, dir]) => {
    acc[dir] = label as Subject
    return acc
  },
  {} as Record<string, Subject | undefined>
)

export function toTitleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function slugifyTitle(value: string) {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
  return trimmed || 'material'
}

export function buildMaterialKey(options: { classId: ClassId; subject: Subject; title: string }) {
  const subjectDir = SUBJECT_DIRS[options.subject]
  const slug = slugifyTitle(options.title)
  const stamp = Date.now()
  return `${MATERIAL_PREFIX}/${options.classId}/${subjectDir}/${stamp}-${slug}.pdf`
}

export function parseMaterialKey(key: string) {
  const normalized = key.replace(/^\/+/, '')
  const parts = normalized.split('/')
  if (parts.length < 4) return null
  const [prefix, classId, subjectDir, ...fileParts] = parts
  if (prefix !== MATERIAL_PREFIX) return null
  if (!CLASS_DIRS.some(entry => entry.id === classId)) return null
  const subject = SUBJECT_DIR_LOOKUP[subjectDir]
  if (!subject) return null
  const fileName = fileParts.join('/')
  if (!fileName.toLowerCase().endsWith('.pdf')) return null

  const baseName = fileName.replace(/\.pdf$/i, '')
  const withoutStamp = baseName.replace(/^\d{10,}-/, '')
  const title = toTitleCase(withoutStamp || 'Study Material')

  return {
    key: normalized,
    classId: classId as ClassId,
    subject,
    title,
  }
}
