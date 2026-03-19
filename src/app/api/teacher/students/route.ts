import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { getTeacherAnalytics } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  return withRole(request, ['teacher', 'admin'], async (user) => {
    try {
      const analytics = await getTeacherAnalytics(user.userId)
      
      return NextResponse.json({
        success: true,
        analytics
      })
    } catch (error) {
      console.error('Teacher analytics error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch analytics', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }
  })
}
