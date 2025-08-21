import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Password verification request for user: ${user.id}`)

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization header required' }, 
        { status: 400 }
      )
    }

    const body = await request.json()
    
    // Input validation
    if (!body.password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      )
    }

    // Log security-relevant action (but not the password!)
    console.log(`Password verification attempt for user ${user.id} at ${new Date().toISOString()}`)

    const response = await fetch(`${API_BASE_URL}/api/profile/verify-password`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      console.warn(`Password verification failed for user ${user.id}`)
      return NextResponse.json(
        { success: false, error: data.detail || 'Failed to verify password' }, 
        { status: response.status }
      )
    }

    console.log(`Password verification successful for user ${user.id}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error in profile verify-password API route for user ${user.id}:`, error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// Export with strict rate limiting for password verification
export const POST = withAuth(handler, { rateLimit: RATE_LIMITS.profile })


