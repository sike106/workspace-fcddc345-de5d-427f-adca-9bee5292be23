import { db } from './db'

const SUSPENSION_MINUTES_DEFAULT = 30

const ABUSIVE_TERMS = [
  'madarchod',
  'bhosdike',
  'chutiya',
  'randi',
  'gandu',
  'behenchod',
  'fuck',
  'fucking',
  'motherfucker',
  'bitch',
  'asshole',
  'bastard',
  'shit',
  'mc',
  'bc',
]

function normalizeForWordMatch(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

export function detectAbusiveLanguage(text: string): { flagged: boolean; matches: string[] } {
  if (!text || !text.trim()) {
    return { flagged: false, matches: [] }
  }

  const normalized = normalizeForWordMatch(text)
  const matches: string[] = []

  for (const term of ABUSIVE_TERMS) {
    const normalizedTerm = term.toLowerCase().trim()
    if (!normalizedTerm) continue
    if (normalized.includes(` ${normalizedTerm} `)) {
      matches.push(normalizedTerm)
    }
  }

  return { flagged: matches.length > 0, matches }
}

export async function suspendUserTemporarily(
  userId: string,
  reason: string,
  minutes = SUSPENSION_MINUTES_DEFAULT
): Promise<Date> {
  const current = await db.user.findUnique({
    where: { id: userId },
    select: { suspendedUntil: true },
  })

  const now = Date.now()
  const candidate = new Date(now + Math.max(1, minutes) * 60 * 1000)
  const existing = current?.suspendedUntil
  const suspendedUntil =
    existing && existing.getTime() > candidate.getTime() ? existing : candidate

  await db.user.update({
    where: { id: userId },
    data: {
      suspendedUntil,
      suspensionReason: reason,
    },
  })

  await db.suspensionMessage.create({
    data: {
      userId,
      senderType: 'system',
      senderName: 'System',
      message: `Account restricted until ${suspendedUntil.toISOString()}. Reason: ${reason}`,
    },
  })

  return suspendedUntil
}
