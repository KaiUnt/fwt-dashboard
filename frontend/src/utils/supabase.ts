export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  return !!(supabaseUrl && supabaseKey && supabaseUrl !== 'your-project-id.supabase.co' && supabaseKey !== 'your-anon-key-here')
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }
  
  const { createClient } = require('@/lib/supabase')
  return createClient()
}
