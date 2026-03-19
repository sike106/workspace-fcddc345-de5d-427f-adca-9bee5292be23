import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { generatePyqApproach } from '@/lib/ai-router'
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
      const approach = await generatePyqApproach({
        question: body?.question,
        subject: body?.subject,
        chapter: body?.chapter,
        exam: body?.exam,
        year: body?.year,
        solution: body?.solution
      })

      if (userState.isGuest) {
        await incrementGuestAiFeatureUsage(user.userId)
      }

      return NextResponse.json({
        success: true,
        approach
      })
    } catch (error) {
      console.error('PYQ approach error:', error)
      return NextResponse.json(
        { error: 'Failed to generate approach', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
