import { NextRequest, NextResponse } from 'next/server'
import { withAuth, RATE_LIMITS, AuthenticatedUser } from '@/lib/auth-middleware'
import { createClient } from '@supabase/supabase-js'
import { AthleteRunInsert } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface RunToSave {
  athlete_id: string
  event_id: string
  event_name?: string
  year: number
  youtube_url: string
  youtube_timestamp?: number
}

async function getHandler(
  user: AuthenticatedUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { searchParams } = new URL(request.url)

    const eventId = searchParams.get('event_id')
    const athleteId = searchParams.get('athlete_id')
    const year = searchParams.get('year')

    let query = supabase.from('athlete_runs').select('*')

    if (eventId) {
      query = query.eq('event_id', eventId)
    }
    if (athleteId) {
      query = query.eq('athlete_id', athleteId)
    }
    if (year) {
      query = query.eq('year', parseInt(year, 10))
    }

    const { data, error } = await query.order('year', { ascending: false })

    if (error) {
      console.error('Failed to fetch runs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch runs' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      runs: data || []
    })
  } catch (error) {
    console.error('Get runs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch runs' },
      { status: 500 }
    )
  }
}

async function postHandler(
  user: AuthenticatedUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await request.json()
    const { runs } = body as { runs: RunToSave[] }

    if (!runs || !Array.isArray(runs) || runs.length === 0) {
      return NextResponse.json(
        { error: 'runs array is required and must not be empty' },
        { status: 400 }
      )
    }

    // Prepare runs for insert with upsert to handle duplicates
    const runsToInsert: AthleteRunInsert[] = runs.map(run => ({
      athlete_id: run.athlete_id,
      event_id: run.event_id,
      event_name: run.event_name || null,
      year: run.year,
      youtube_url: run.youtube_url,
      youtube_timestamp: run.youtube_timestamp || 0,
      created_by: user.id
    }))

    // Use upsert with on_conflict to update existing entries
    const { data, error } = await supabase
      .from('athlete_runs')
      .upsert(runsToInsert, {
        onConflict: 'athlete_id,event_id,year',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error('Failed to save runs:', error)
      return NextResponse.json(
        { error: `Failed to save runs: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      saved: data?.length || runsToInsert.length,
      message: `Successfully saved ${data?.length || runsToInsert.length} athlete runs`
    })
  } catch (error) {
    console.error('Save runs error:', error)
    return NextResponse.json(
      { error: 'Failed to save runs' },
      { status: 500 }
    )
  }
}

async function deleteHandler(
  user: AuthenticatedUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')
    const eventId = searchParams.get('event_id')
    const year = searchParams.get('year')

    if (id) {
      // Delete single run by ID
      const { error } = await supabase
        .from('athlete_runs')
        .delete()
        .eq('id', id)

      if (error) {
        return NextResponse.json(
          { error: `Failed to delete run: ${error.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, message: 'Run deleted' })
    }

    if (eventId && year) {
      // Delete all runs for event + year
      const { error, count } = await supabase
        .from('athlete_runs')
        .delete()
        .eq('event_id', eventId)
        .eq('year', parseInt(year, 10))

      if (error) {
        return NextResponse.json(
          { error: `Failed to delete runs: ${error.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${count || 0} runs for event ${eventId} year ${year}`
      })
    }

    return NextResponse.json(
      { error: 'Either id or (event_id and year) is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Delete runs error:', error)
    return NextResponse.json(
      { error: 'Failed to delete runs' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(getHandler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin
})

export const POST = withAuth(postHandler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin
})

export const DELETE = withAuth(deleteHandler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin
})
