import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    // This endpoint is a placeholder proxy. Implement backend endpoint to return admin users list.
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: data.detail || 'Failed to fetch users' }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin users API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


