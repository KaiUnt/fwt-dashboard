import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const qs = searchParams.toString()
    const url = `${API_BASE_URL}/api/admin/athletes/search${qs ? `?${qs}` : ''}`

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Admin athletes search failed for ${user.email}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch athletes' },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin athletes search API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withAuth(handler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin,
})
