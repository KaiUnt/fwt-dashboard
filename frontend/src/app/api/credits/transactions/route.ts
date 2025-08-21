import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Credit transactions request for user: ${user.id}`)

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 400 }
      )
    }

    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/credits/transactions`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`Credit transactions request failed for user ${user.id}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch credit transactions' },
        { status: response.status }
      )
    }

    console.log(`Credit transactions retrieved successfully for user ${user.id}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error in credits transactions API route for user ${user.id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export with credits rate limiting
export const GET = withAuth(handler, { rateLimit: RATE_LIMITS.credits })
