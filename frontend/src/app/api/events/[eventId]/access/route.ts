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

    // Validate eventId format
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

    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/access`, {
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
      // non-JSON body
    }

    if (!response.ok) {
      console.error(`Event access check failed for user ${user.id}, event ${eventId}:`, data)
      const message = typeof data === 'object' && data && (data as any).detail
        ? (data as any).detail
        : typeof data === 'string' ? data : 'Failed to check event access'
      return NextResponse.json(
        { error: message },
        { status: response.status }
      )
    }

    return NextResponse.json(
      typeof data === 'object' ? data as any : { data }
    )
  } catch (error) {
    console.error('Error in event access check API route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export with standard rate limiting
export const GET = withAuth(handler, { rateLimit: RATE_LIMITS.standard })
