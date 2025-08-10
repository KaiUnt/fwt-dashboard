import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header from the request
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      )
    }

    console.log('Credits balance API route: Forwarding to backend at', API_BASE_URL)

    // Forward the request to the FastAPI backend
    const response = await fetch(`${API_BASE_URL}/api/credits/balance`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    })

    console.log('Credits balance API route: Backend response status:', response.status)

    const data = await response.json()

    if (!response.ok) {
      console.error('Credits balance API route: Backend error:', data)
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch credits balance' },
        { status: response.status }
      )
    }

    console.log('Credits balance API route: Success, returning data:', data)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in credits balance API route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
