import { NextRequest, NextResponse } from 'next/server'
import { withAuth, RATE_LIMITS, AuthenticatedUser } from '@/lib/auth-middleware'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface RiderToMatch {
  name: string
  bib?: string
}

interface MatchResult {
  riderName: string
  athleteId: string | null
  athleteName: string | null
  confidence: 'exact' | 'normalized' | 'fuzzy' | 'none'
}

function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function handler(
  user: AuthenticatedUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await request.json()
    const { riders } = body as { riders: RiderToMatch[] }

    if (!riders || !Array.isArray(riders)) {
      return NextResponse.json(
        { error: 'riders array is required' },
        { status: 400 }
      )
    }

    // Fetch all athletes from database
    const { data: athletes, error } = await supabase
      .from('athletes')
      .select('id, name')

    if (error) {
      console.error('Failed to fetch athletes:', error)
      return NextResponse.json(
        { error: 'Failed to fetch athletes from database' },
        { status: 500 }
      )
    }

    // Create lookup maps
    const exactMap = new Map<string, { id: string; name: string }>()
    const normalizedMap = new Map<string, { id: string; name: string }>()

    for (const athlete of athletes || []) {
      exactMap.set(athlete.name, { id: athlete.id, name: athlete.name })
      normalizedMap.set(normalizeString(athlete.name), { id: athlete.id, name: athlete.name })
    }

    // Match riders
    const results: MatchResult[] = riders.map(rider => {
      // Try exact match first
      const exactMatch = exactMap.get(rider.name)
      if (exactMatch) {
        return {
          riderName: rider.name,
          athleteId: exactMatch.id,
          athleteName: exactMatch.name,
          confidence: 'exact' as const
        }
      }

      // Try normalized match
      const normalizedName = normalizeString(rider.name)
      const normalizedMatch = normalizedMap.get(normalizedName)
      if (normalizedMatch) {
        return {
          riderName: rider.name,
          athleteId: normalizedMatch.id,
          athleteName: normalizedMatch.name,
          confidence: 'normalized' as const
        }
      }

      // No match found
      return {
        riderName: rider.name,
        athleteId: null,
        athleteName: null,
        confidence: 'none' as const
      }
    })

    const matched = results.filter(r => r.athleteId !== null).length
    const unmatched = results.filter(r => r.athleteId === null).length

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: riders.length,
        matched,
        unmatched
      }
    })
  } catch (error) {
    console.error('Athlete matching error:', error)
    return NextResponse.json(
      { error: 'Failed to match athletes' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin
})
