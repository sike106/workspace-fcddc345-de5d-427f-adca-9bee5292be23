import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getUserAnalytics } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const analytics = await getUserAnalytics(user.userId)
      
      return NextResponse.json({
        success: true,
        analytics
      })
    } catch (error) {
      console.error('Analytics error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch analytics', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
