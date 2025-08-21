import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Admin overview request by: ${user.email} (${user.role})`)

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' }, 
        { status: 400 }
      )
    }

    const response = await fetch(`${API_BASE_URL}/api/admin/overview`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Admin overview request failed for ${user.email}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch admin overview' }, 
        { status: response.status }
      )
    }

    console.log(`Admin overview request successful for ${user.email}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin overview API route:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// CRITICAL: Admin only endpoint with admin rate limiting
export const GET = withAuth(handler, { 
  requireAdmin: true, 
  rateLimit: RATE_LIMITS.admin 
})


