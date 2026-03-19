function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const DEFAULT_GUEST_AI_FEATURE_LIMIT = 50
const DEFAULT_GUEST_AI_TUTOR_RESPONSE_LIMIT = 30
const DEFAULT_GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24

export const GUEST_AI_FEATURE_LIMIT = readPositiveInt(
  process.env.GUEST_AI_FEATURE_LIMIT,
  DEFAULT_GUEST_AI_FEATURE_LIMIT
)

export const GUEST_AI_TUTOR_RESPONSE_LIMIT = readPositiveInt(
  process.env.GUEST_AI_TUTOR_RESPONSE_LIMIT,
  DEFAULT_GUEST_AI_TUTOR_RESPONSE_LIMIT
)

export const GUEST_SESSION_MAX_AGE_SECONDS = readPositiveInt(
  process.env.GUEST_SESSION_MAX_AGE_SECONDS,
  DEFAULT_GUEST_SESSION_MAX_AGE_SECONDS
)

export const GUEST_SESSION_MAX_AGE_MS = GUEST_SESSION_MAX_AGE_SECONDS * 1000
