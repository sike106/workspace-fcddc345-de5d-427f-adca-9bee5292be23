import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { generatePracticeCoach } from '@/lib/ai-router'
import {
  getUserGuestState,
  getGuestAiFeatureUsage,
  guestAiFeatureLimitResponse,
  incrementGuestAiFeatureUsage,
} from '@/lib/guest-ai-limits'
import { GUEST_AI_FEATURE_LIMIT } from '@/lib/guest-config'

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userState = await getUserGuestState(user.userId)
      if (!userState) {
        return NextResponse.json(
          { error: 'Invalid user session', code: 'INVALID_TOKEN' },
          { status: 401 }
        )
      }

      if (userState.isGuest) {
        const used = await getGuestAiFeatureUsage(user.userId)
        if (used >= GUEST_AI_FEATURE_LIMIT) {
          return guestAiFeatureLimitResponse(used)
        }
      }

      const body = await request.json()
      const coach = await generatePracticeCoach(body, body?.mode || 'exam')

      if (userState.isGuest) {
        await incrementGuestAiFeatureUsage(user.userId)
      }

      return NextResponse.json({
        success: true,
        coach
      })
    } catch (error) {
      console.error('Practice coach error:', error)
      return NextResponse.json(
        { error: 'Failed to generate coach feedback', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
