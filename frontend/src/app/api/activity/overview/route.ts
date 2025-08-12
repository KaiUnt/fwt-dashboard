import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const filter = url.searchParams.get('filter') || 'all'

    const response = await fetch(`${API_BASE_URL}/api/activity/overview?filter=${encodeURIComponent(filter)}`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: data.detail || 'Failed to fetch activity overview' }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in activity overview API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


