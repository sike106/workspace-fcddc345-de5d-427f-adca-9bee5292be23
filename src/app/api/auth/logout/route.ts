import { NextResponse } from 'next/server'
import { clearAuthCookie, clearPasswordReauthCookie } from '@/lib/auth'

export async function POST() {
  const response = NextResponse.json({ success: true })
  await clearAuthCookie(response)
  await clearPasswordReauthCookie(response)
  return response
}
