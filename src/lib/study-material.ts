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

export type Subject = keyof typeof SUBJECT_DIRS
export type ClassId = (typeof CLASS_DIRS)[number]['id']

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

export function extractDriveFileId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  const directMatch = trimmed.match(/[-\w]{25,}/)
  const patterns = [
    /\/file\/d\/([^/]+)/i,
    /[?&]id=([^&]+)/i,
    /\/d\/([^/]+)/i,
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) return match[1]
  }

  return directMatch ? directMatch[0] : null
}

export function buildDriveLinks(fileId: string | null, fallbackUrl: string) {
  if (fileId) {
    return {
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    }
  }

  return {
    viewUrl: fallbackUrl,
    downloadUrl: fallbackUrl,
  }
}
