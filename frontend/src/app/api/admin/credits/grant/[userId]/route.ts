import { NextResponse } from 'next/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: Request, context: any) {
  try {
    const { userId } = (context?.params || {}) as { userId: string }
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    const body = await request.json()

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
      return NextResponse.json({ error: data.detail || 'Failed to grant credits' }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in admin grant credits API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


