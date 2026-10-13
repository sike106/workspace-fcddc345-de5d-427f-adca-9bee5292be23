import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { generateRevisionNotes } from '@/lib/ai-router'
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
      const { subject, chapter, examType = 'JEE Main' } = body

      if (!subject || !chapter) {
        return NextResponse.json(
          { error: 'Subject and chapter are required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      const notes = await generateRevisionNotes(
        subject,
        chapter,
        examType,
        user.userId
      )

      if (userState.isGuest) {
        await incrementGuestAiFeatureUsage(user.userId)
      }

      return NextResponse.json({
        success: true,
        notes,
        subject,
        chapter,
        examType
      })
    } catch (error) {
      console.error('Revision notes error:', error)
      return NextResponse.json(
        { error: 'Failed to generate revision notes', code: 'AI_ERROR' },
        { status: 500 }
      )
    }
  })
}
