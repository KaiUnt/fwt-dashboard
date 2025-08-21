import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function handler(user: AuthenticatedUser, request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Multi-event purchase request for user: ${user.id}`);

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 400 }
      );
    }

    // Get and validate request body
    const body = await request.json();
    
    // Log purchase attempt for security monitoring
    console.log(`Purchase attempt by user ${user.id}:`, {
      eventIds: body.eventIds || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    // Forward to FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/events/purchase-multiple`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Multi-event purchase failed for user ${user.id}:`, data);
      return NextResponse.json(
        { error: data.detail || 'Multi-event purchase failed' },
        { status: response.status }
      );
    }

    console.log(`Multi-event purchase successful for user ${user.id}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Multi-event purchase API error for user ${user.id}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export with strict rate limiting for purchases
export const POST = withAuth(handler, { rateLimit: RATE_LIMITS.purchase });
