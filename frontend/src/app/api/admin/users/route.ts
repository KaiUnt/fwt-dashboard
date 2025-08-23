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

    // Forward to backend (backend should also validate admin role)
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Admin users request failed for ${user.email}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch users' }, 
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin users API route:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// Export with admin role requirement and admin rate limiting
export const GET = withAuth(handler, { 
  requireAdmin: true,  // Fixed: Auth middleware now reads role from user_profiles
  rateLimit: RATE_LIMITS.admin 
})


