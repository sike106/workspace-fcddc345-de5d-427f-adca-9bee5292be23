import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getLeaderboard } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url)
      const limit = parseInt(searchParams.get('limit') || '10', 10)
      const leaderboard = await getLeaderboard(user.userId, limit)

      return NextResponse.json({
        success: true,
        leaderboard
      })
    } catch (error) {
      console.error('Leaderboard error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch leaderboard', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
