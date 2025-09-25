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

    // Parse the request body to get event IDs (accept camelCase and snake_case)
    const body = await request.json()
    const eventIds: unknown = body.eventIds ?? body.event_ids

    if (!eventIds || !Array.isArray(eventIds) || (eventIds as unknown[]).length === 0) {
      return NextResponse.json(
        { error: 'eventIds/event_ids array is required' },
        { status: 400 }
      )
    }

    // Validate eventIds are strings and limit batch size
    if (!(eventIds as unknown[]).every(id => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'All eventIds/event_ids must be strings' },
        { status: 400 }
      )
    }

    // Prevent abuse - limit batch size (raised to 1000)
    if ((eventIds as string[]).length > 1000) {
      return NextResponse.json(
        { error: 'Maximum 1000 events per batch request' },
        { status: 400 }
      )
    }


    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/events/access-batch`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ event_ids: eventIds as string[] })
    })

    const raw = await response.text()
    let data: unknown = raw
    try {
      data = JSON.parse(raw)
    } catch {
      // non-JSON body
    }

    if (!response.ok) {
      console.error(`Batch event access check failed for user ${user.id}:`, data)
      const detail = (data as Record<string, unknown> | string)
      const message = typeof detail === 'object' && detail && 'detail' in detail && typeof (detail as { detail?: unknown }).detail === 'string'
        ? (detail as { detail: string }).detail
        : typeof detail === 'string' ? detail : 'Failed to check batch event access'
      return NextResponse.json(
        { error: message },
        { status: response.status }
      )
    }

    return NextResponse.json(
      typeof data === 'object' ? data as Record<string, unknown> : { data }
    )
  } catch (error) {
    console.error(`Error in batch event access check API route for user ${user.id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export with standard rate limiting
export const POST = withAuth(handler, { rateLimit: RATE_LIMITS.standard })
