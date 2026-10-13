import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { db } from './db'

const OTP_TTL_MINUTES = Number.parseInt(process.env.OTP_TTL_MINUTES || '', 10) || 10
const OTP_RESEND_SECONDS = Number.parseInt(process.env.OTP_RESEND_SECONDS || '', 10) || 60
const OTP_MAX_ATTEMPTS = Number.parseInt(process.env.OTP_MAX_ATTEMPTS || '', 10) || 5

export type OtpPurpose = 'login' | 'password_reset'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const generateOtpCode = (): string =>
  String(Math.floor(100000 + Math.random() * 900000))

type EmailOtpRecord = {
  id: string
  email: string
  purpose: string
  codeHash: string
  attempts: number
  consumedAt: Date | string | null
  expiresAt: Date | string
  createdAt: Date | string
}

function canUseEmailOtpDelegate(): boolean {
  return Boolean((db as any)?.emailOtp?.findFirst)
}

async function findRecentOtp(email: string, purpose: OtpPurpose, createdAfter: Date) {
  if (canUseEmailOtpDelegate()) {
    return db.emailOtp.findFirst({
      where: {
        email,
        purpose,
        createdAt: { gt: createdAfter },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  const rows = await db.$queryRaw<EmailOtpRecord[]>(
    Prisma.sql`
      SELECT "id", "email", "purpose", "codeHash", "attempts", "consumedAt", "expiresAt", "createdAt"
      FROM "EmailOtp"
      WHERE "email" = ${email}
        AND "purpose" = ${purpose}
        AND "createdAt" > ${createdAfter}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  )

  return rows[0] || null
}

async function cleanupOldOtps(email: string, purpose: OtpPurpose, now: Date) {
  if (canUseEmailOtpDelegate()) {
    await db.emailOtp.deleteMany({
      where: {
        email,
        purpose,
        OR: [
          { consumedAt: { not: null } },
          { expiresAt: { lt: now } },
        ],
      },
    })
    return
  }

  await db.$executeRaw(
    Prisma.sql`
      DELETE FROM "EmailOtp"
      WHERE "email" = ${email}
        AND "purpose" = ${purpose}
        AND ("consumedAt" IS NOT NULL OR "expiresAt" < ${now})
    `
  )
}

async function createOtpRecord(email: string, purpose: OtpPurpose, codeHash: string, expiresAt: Date) {
  if (canUseEmailOtpDelegate()) {
    await db.emailOtp.create({
      data: {
        email,
        purpose,
        codeHash,
        expiresAt,
      },
    })
    return
  }

  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "EmailOtp" ("id", "email", "purpose", "codeHash", "attempts", "expiresAt", "createdAt")
      VALUES (${crypto.randomUUID()}, ${email}, ${purpose}, ${codeHash}, 0, ${expiresAt}, CURRENT_TIMESTAMP)
    `
  )
}

async function findActiveOtp(email: string, purpose: OtpPurpose, now: Date) {
  if (canUseEmailOtpDelegate()) {
    return db.emailOtp.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  const rows = await db.$queryRaw<EmailOtpRecord[]>(
    Prisma.sql`
      SELECT "id", "email", "purpose", "codeHash", "attempts", "consumedAt", "expiresAt", "createdAt"
      FROM "EmailOtp"
      WHERE "email" = ${email}
        AND "purpose" = ${purpose}
        AND "consumedAt" IS NULL
        AND "expiresAt" > ${now}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  )

  return rows[0] || null
}

async function incrementOtpAttempts(id: string) {
  if (canUseEmailOtpDelegate()) {
    await db.emailOtp.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    })
    return
  }

  await db.$executeRaw(
    Prisma.sql`UPDATE "EmailOtp" SET "attempts" = "attempts" + 1 WHERE "id" = ${id}`
  )
}

async function consumeOtp(id: string, consumedAt: Date) {
  if (canUseEmailOtpDelegate()) {
    await db.emailOtp.update({
      where: { id },
      data: { consumedAt },
    })
    return
  }

  await db.$executeRaw(
    Prisma.sql`UPDATE "EmailOtp" SET "consumedAt" = ${consumedAt} WHERE "id" = ${id}`
  )
}

export async function issueEmailOtp(email: string, purpose: OtpPurpose) {
  const normalizedEmail = normalizeEmail(email)
  const now = new Date()
  const recent = await findRecentOtp(
    normalizedEmail,
    purpose,
    new Date(now.getTime() - OTP_RESEND_SECONDS * 1000)
  )

  if (recent) {
    return { ok: false as const, code: 'OTP_TOO_SOON', retryAfter: OTP_RESEND_SECONDS }
  }

  await cleanupOldOtps(normalizedEmail, purpose, now)

  const code = generateOtpCode()
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000)

  await createOtpRecord(normalizedEmail, purpose, codeHash, expiresAt)

  return { ok: true as const, code, expiresAt }
}

export async function verifyEmailOtp(email: string, purpose: OtpPurpose, code: string) {
  const normalizedEmail = normalizeEmail(email)
  const now = new Date()
  const record = await findActiveOtp(normalizedEmail, purpose, now)

  if (!record) {
    return { ok: false as const, code: 'OTP_INVALID' }
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false as const, code: 'OTP_LOCKED' }
  }

  const isValid = await bcrypt.compare(code, record.codeHash)
  if (!isValid) {
    await incrementOtpAttempts(record.id)
    return { ok: false as const, code: 'OTP_INVALID' }
  }

  await consumeOtp(record.id, now)

  return { ok: true as const }
}
