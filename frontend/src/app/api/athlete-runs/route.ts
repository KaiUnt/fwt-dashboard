import { NextRequest, NextResponse } from 'next/server'
import { withAuth, RATE_LIMITS, AuthenticatedUser } from '@/lib/auth-middleware'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function handler(
  user: AuthenticatedUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { searchParams } = new URL(request.url)

    const athleteId = searchParams.get('athlete_id')
    const athleteIds = searchParams.get('athlete_ids')
    const eventId = searchParams.get('event_id')

    let query = supabase.from('athlete_runs').select('*')

    if (athleteId) {
      query = query.eq('athlete_id', athleteId)
    } else if (athleteIds) {
      const ids = athleteIds.split(',').map(id => id.trim()).filter(Boolean)
      if (ids.length > 0) {
        query = query.in('athlete_id', ids)
      }
    }

    if (eventId) {
      query = query.eq('event_id', eventId)
    }

    const { data, error } = await query.order('year', { ascending: false })

    if (error) {
      console.error('Failed to fetch athlete runs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch athlete runs' },
        { status: 500 }
      )
    }

    // Group by athlete_id for easier consumption
    const groupedByAthlete: Record<string, typeof data> = {}
    for (const run of data || []) {
      if (!groupedByAthlete[run.athlete_id]) {
        groupedByAthlete[run.athlete_id] = []
      }
      groupedByAthlete[run.athlete_id].push(run)
    }

    return NextResponse.json({
      success: true,
      runs: data || [],
      byAthlete: groupedByAthlete
    })
  } catch (error) {
    console.error('Get athlete runs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch athlete runs' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler, {
  rateLimit: RATE_LIMITS.standard
})
