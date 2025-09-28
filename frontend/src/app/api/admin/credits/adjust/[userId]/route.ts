import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest, ctx: { params: { userId: string } }): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 400 })
    }

    const { userId } = ctx.params
    const body = await request.json()

    const response = await fetch(`${API_BASE_URL}/api/admin/credits/adjust/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Admin credits adjust failed for ${user.email} on user ${userId}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to adjust credits' },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin credits adjust API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withAuth(handler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin,
})

