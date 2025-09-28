import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 400 })
    }

    const payload = await request.json().catch(() => ({})) as Record<string, unknown>

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined
    const ua = request.headers.get('user-agent') || undefined

    const response = await fetch(`${API_BASE_URL}/api/activity/log-login`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        ip,
        user_agent: ua,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Log login activity failed for ${user.email}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to log login activity' },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in log-login API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withAuth(handler, {
  rateLimit: RATE_LIMITS.profile,
})

