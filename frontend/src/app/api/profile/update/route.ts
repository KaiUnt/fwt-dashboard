import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Profile update request for user: ${user.id}`)

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization header required' }, 
        { status: 400 }
      )
    }

    const body = await request.json()
    
    // Basic input validation
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Update data is required' },
        { status: 400 }
      )
    }

    // Log profile update for audit trail
    console.log(`Profile update attempt for user ${user.id}:`, {
      fields: Object.keys(body),
      timestamp: new Date().toISOString()
    })

    const response = await fetch(`${API_BASE_URL}/api/profile/update`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Profile update failed for user ${user.id}:`, data)
      return NextResponse.json(
        { success: false, error: data.detail || 'Failed to update profile' }, 
        { status: response.status }
      )
    }

    console.log(`Profile update successful for user ${user.id}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error in profile update API route for user ${user.id}:`, error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// Export with standard rate limiting
export const POST = withAuth(handler, { rateLimit: RATE_LIMITS.standard })


