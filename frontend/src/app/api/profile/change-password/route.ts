import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Password change request for user: ${user.id}`)

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization header required' }, 
        { status: 400 }
      )
    }

    const body = await request.json()
    
    // Basic input validation
    if (!body.currentPassword || !body.newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 }
      )
    }

    // Log security-relevant action
    console.log(`Password change attempt for user ${user.id} at ${new Date().toISOString()}`)

    const response = await fetch(`${API_BASE_URL}/api/profile/change-password`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Password change failed for user ${user.id}:`, data)
      return NextResponse.json(
        { success: false, error: data.detail || 'Failed to change password' }, 
        { status: response.status }
      )
    }

    console.log(`Password change successful for user ${user.id}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error in profile change-password API route for user ${user.id}:`, error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// Export with strict rate limiting for password changes
export const POST = withAuth(handler, { rateLimit: RATE_LIMITS.profile })


