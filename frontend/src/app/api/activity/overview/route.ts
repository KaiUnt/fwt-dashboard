import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' }, 
        { status: 400 }
      )
    }

    const url = new URL(request.url)
    const filter = url.searchParams.get('filter') || 'all'
    
    // Validate filter parameter
    const allowedFilters = ['all', 'recent', 'today', 'week', 'month']
    if (!allowedFilters.includes(filter)) {
      return NextResponse.json(
        { error: 'Invalid filter parameter' },
        { status: 400 }
      )
    }

    const response = await fetch(`${API_BASE_URL}/api/activity/overview?filter=${encodeURIComponent(filter)}`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    const raw = await response.text()
    let data: unknown = raw
    try {
      data = JSON.parse(raw)
    } catch {
      // non-JSON body
    }
    if (!response.ok) {
      console.error(`Activity overview request failed for user ${user.id}:`, data)
      const message = typeof data === 'object' && data && (data as any).detail
        ? (data as any).detail
        : typeof data === 'string' ? data : 'Failed to fetch activity overview'
      return NextResponse.json(
        { error: message }, 
        { status: response.status }
      )
    }

    return NextResponse.json(
      typeof data === 'object' ? data as any : { data }
    )
  } catch (error) {
    console.error(`Error in activity overview API route for user ${user.id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// Export with standard rate limiting
export const GET = withAuth(handler, { rateLimit: RATE_LIMITS.standard })


