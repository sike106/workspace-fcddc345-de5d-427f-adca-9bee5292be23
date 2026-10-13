import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { generateHint, AIMode } from '@/lib/ai-router'
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
      const { question, subject, mode = 'exam' } = body

      if (!question) {
        return NextResponse.json(
          { error: 'Question is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const validModes: AIMode[] = ['strict', 'friendly', 'exam']
      const selectedMode = validModes.includes(mode) ? mode : 'exam'

      const hint = await generateHint(question, subject || 'General', user.userId, selectedMode)

      if (userState.isGuest) {
        await incrementGuestAiFeatureUsage(user.userId)
      }

      return NextResponse.json({
        success: true,
        hint
      })
    } catch (error) {
      console.error('Hint generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate hint', code: 'AI_ERROR' },
        { status: 500 }
      )
    }
  })
}
