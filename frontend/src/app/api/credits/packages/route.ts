import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, _request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Credit packages request for user: ${user.id}`)

    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/credits/packages`, {
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`Credit packages request failed for user ${user.id}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch credit packages' },
        { status: response.status }
      )
    }

    console.log(`Credit packages retrieved successfully for user ${user.id}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error in credits packages API route for user ${user.id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Even though packages could be public, we protect it to prevent abuse
export const GET = withAuth(handler, { rateLimit: RATE_LIMITS.standard })
