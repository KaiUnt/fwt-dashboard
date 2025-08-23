import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function handler(
  user: AuthenticatedUser, 
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await params
    

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' }, 
        { status: 400 }
      )
    }

    const body = await request.json()
    
    // Log admin action for audit trail
      targetUserId: userId,
      amount: body.amount || 'unknown',
      reason: body.reason || 'not specified',
      timestamp: new Date().toISOString()
    })

    const response = await fetch(`${API_BASE_URL}/api/admin/credits/grant/${userId}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error(`Credit grant failed by ${user.email} for user ${userId}:`, data)
      return NextResponse.json(
        { error: data.detail || 'Failed to grant credits' }, 
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin grant credits API route:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

// Export with admin requirement and admin rate limiting
export const POST = withAuth(handler, { 
  requireAdmin: true, 
  rateLimit: RATE_LIMITS.admin 
})


