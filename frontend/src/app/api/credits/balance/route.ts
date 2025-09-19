import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {

    // Get the authorization header to forward to backend
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header missing' },
        { status: 400 }
      )
    }

    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/credits/balance`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    })

    const raw = await response.text()
    let data: unknown = raw
    try {
      data = JSON.parse(raw)
    } catch {
      // non-JSON body, keep as text
    }

    if (!response.ok) {
      console.error('Backend error for user', user.id, ':', data)
      const message = typeof data === 'object' && data && (data as any).detail
        ? (data as any).detail
        : typeof data === 'string'
          ? data
          : 'Failed to fetch credits balance'

      return NextResponse.json(
        { error: message },
        { status: response.status }
      )
    }

    return NextResponse.json(
      typeof data === 'object' ? data as any : { data }
    )
  } catch (error) {
    console.error('Error in credits balance API route for user', user.id, ':', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export the protected route with rate limiting
export const GET = withAuth(handler, { rateLimit: RATE_LIMITS.credits })
