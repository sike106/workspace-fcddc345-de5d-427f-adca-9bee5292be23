import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/lib/auth'
import { getAiProviderStatus } from '@/lib/ai-router'

export async function GET(request: NextRequest) {
  return withRole(request, ['admin'], async () => {
    const status = getAiProviderStatus()
    return NextResponse.json({ status })
  })
}
