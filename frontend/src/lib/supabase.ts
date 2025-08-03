import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

// Client für Browser (Client Components)
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// Activity Tracking Helper
export const logUserAction = async (
  action_type: string,
  resource_type?: string,
  resource_id?: string,
  action_details?: Record<string, unknown>
) => {
  const supabase = createClient()
  
  try {
    const { error } = await supabase.rpc('log_user_action', {
      p_action_type: action_type,
      p_resource_type: resource_type,
      p_resource_id: resource_id,
      p_action_details: action_details || {}
    })
    
    if (error) {
      console.warn('Failed to log user action:', error)
    }
  } catch (err) {
    console.warn('Failed to log user action:', err)
  }
}

// User Profile Helper
export const getUserProfile = async () => {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  
  return profile
}

// Check if user is admin
export const isAdmin = async (): Promise<boolean> => {
  const profile = await getUserProfile()
  return profile?.role === 'admin'
}