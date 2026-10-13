import { NextResponse } from 'next/server'
import { db } from './db'
import { GUEST_AI_FEATURE_LIMIT } from './guest-config'

export async function getUserGuestState(userId: string): Promise<{ id: string; isGuest: boolean } | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, isGuest: true },
  })
}

export async function getGuestAiFeatureUsage(userId: string): Promise<number> {
  const usage = await db.guestAiUsage.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { aiActionsUsed: true },
  })
  return usage.aiActionsUsed
}

export async function incrementGuestAiFeatureUsage(userId: string): Promise<number> {
  const usage = await db.guestAiUsage.upsert({
    where: { userId },
    update: {
      aiActionsUsed: { increment: 1 },
    },
    create: {
      userId,
      aiActionsUsed: 1,
    },
    select: { aiActionsUsed: true },
  })
  return usage.aiActionsUsed
}

export function guestAiFeatureLimitResponse(used: number): NextResponse {
  return NextResponse.json(
    {
      error:
        'Your free guest AI tries are over for now. Please log in to continue with unlimited AI notes, hints, and guidance.',
      code: 'GUEST_AI_FEATURE_LIMIT',
      limit: GUEST_AI_FEATURE_LIMIT,
      used,
    },
    { status: 403 }
  )
}
