import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedUser, RATE_LIMITS } from '@/lib/auth-middleware'

async function handler(user: AuthenticatedUser, _request: NextRequest): Promise<NextResponse> {
  try {
    console.log(`Credit packages request for user: ${user.id}`)

    // Since credits are currently just for abuse protection and no real payment integration,
    // we can return the packages directly without backend call
    const packages = [
      {
        package_type: "single",
        credits: 1,
        price_cents: 1000,  // 10.00 EUR
        price_display: "10€"
      },
      {
        package_type: "pack_5",
        credits: 5,
        price_cents: 4000,  // 40.00 EUR
        price_display: "40€"
      },
      {
        package_type: "pack_10",
        credits: 10,
        price_cents: 7000,  // 70.00 EUR
        price_display: "70€"
      }
    ]
    
    const response = {
      success: true,
      packages: packages,
      currency: "EUR",
      message: "Credit packages retrieved successfully"
    }

    console.log(`Credit packages retrieved successfully for user ${user.id}`)
    return NextResponse.json(response)
  } catch (error) {
    console.error(`Error in credits packages API route for user ${user.id}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Protected to prevent abuse and for consistent credits API behavior
export const GET = withAuth(handler, { rateLimit: RATE_LIMITS.credits })
