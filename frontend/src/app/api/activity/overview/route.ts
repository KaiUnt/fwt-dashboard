import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Activity overview request for user: ${user.id}`)

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

    const data = await response.json()
    if (!response.ok) {
      console.error(`Activity overview request failed for user ${user.id}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch activity overview' }, 
        { status: response.status }
      )
    }

    console.log(`Activity overview retrieved successfully for user ${user.id}`)
    return NextResponse.json(data)
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


