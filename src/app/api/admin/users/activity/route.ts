import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { getAdminUserActivity } from '@/lib/admin-users'

export async function GET(request: NextRequest) {
  try {
    return await withRole(request, ['admin'], async () => {
      const { searchParams } = new URL(request.url)
      const limitRaw = Number.parseInt(searchParams.get('limit') || '200', 10)
      const limit = Number.isFinite(limitRaw) ? limitRaw : 200
      const users = await getAdminUserActivity(limit)

      return NextResponse.json({
        success: true,
        users,
      })
    })
  } catch (error) {
    console.error('Admin activity error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      {
        error: 'Failed to load activity data.',
        code: 'SERVER_ERROR',
        ...(isDev ? { details: (error as Error)?.message || String(error) } : {}),
      },
      { status: 500 }
    )
  }
}
