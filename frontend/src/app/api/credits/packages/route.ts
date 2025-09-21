import { NextResponse } from 'next/server'

// Packages are deprecated and disabled
export function GET() {
  return NextResponse.json({
    success: false,
    packages: [],
    message: 'Credit packages are disabled'
  }, { status: 410 })
}
