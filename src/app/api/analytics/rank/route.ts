import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { calculateRankPrediction } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const prediction = await calculateRankPrediction(user.userId)
      
      return NextResponse.json({
        success: true,
        prediction
      })
    } catch (error) {
      console.error('Rank prediction error:', error)
      return NextResponse.json(
        { error: 'Failed to calculate rank prediction', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
