import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const now = new Date()
    const users = await db.user.findMany({
      where: {
        suspendedUntil: {
          gt: now,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isGuest: true,
        suspendedUntil: true,
        suspensionReason: true,
        suspensionMessagingDisabled: true,
      },
      orderBy: {
        suspendedUntil: 'asc',
      },
      take: 200,
    })

    return NextResponse.json({
      success: true,
      users,
    })
  })
}
