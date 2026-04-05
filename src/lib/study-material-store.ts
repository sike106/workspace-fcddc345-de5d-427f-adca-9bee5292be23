import { db } from '@/lib/db'

export type StoredStudyMaterial = {
  id: string
  title: string
  classId: 'class-11' | 'class-12' | 'jee'
  subject: 'Physics' | 'Chemistry' | 'Mathematics'
  driveUrl: string
  driveFileId?: string | null
  sizeMb?: number | null
  createdAt: string
}

const STORAGE_KEY = 'study_material_items'

function parseItems(raw: string | null | undefined): StoredStudyMaterial[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(Boolean) as StoredStudyMaterial[]
  } catch {
    return []
  }
}

export async function readStudyMaterials(): Promise<StoredStudyMaterial[]> {
  const row = await db.systemConfig.findUnique({ where: { key: STORAGE_KEY } })
  return parseItems(row?.value)
}

export async function writeStudyMaterials(items: StoredStudyMaterial[]): Promise<void> {
  const value = JSON.stringify(items)
  await db.systemConfig.upsert({
    where: { key: STORAGE_KEY },
    update: { value },
    create: { key: STORAGE_KEY, value },
  })
}
