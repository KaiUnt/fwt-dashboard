import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(
  user: AuthenticatedUser,
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const { eventId } = await params

    // Validate eventId
    if (!eventId || eventId.trim().length === 0) {
      return NextResponse.json(
        { error: 'Valid event ID is required' },
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 400 }
      )
    }

    // Get and validate request body
    const body = await request.json()
    
    // Log purchase attempt for security and business monitoring
      eventId,
      purchaseData: body,
      timestamp: new Date().toISOString(),
      userEmail: user.email
    })

    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/purchase`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`Event purchase FAILED for user ${user.id}, event ${eventId}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to purchase event access' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error in event purchase API route for user ${user.id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// CRITICAL: Purchase endpoint with strict rate limiting
export const POST = withAuth(handler, { rateLimit: RATE_LIMITS.purchase })
