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

// Debug Supabase Auth Session
export const debugAuthSession = async () => {
  const supabase = createClient()
  
  try {
    console.log('=== Supabase Auth Debug ===')
    
    // Check session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('Session check:', {
      hasSession: !!session,
      sessionError,
      user: session?.user ? {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role
      } : null,
      accessToken: session?.access_token ? {
        length: session.access_token.length,
        starts: session.access_token.substring(0, 20) + '...',
        expires: session.expires_at
      } : null
    })
    
    // Check user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('User check:', {
      hasUser: !!user,
      userError,
      userId: user?.id,
      userEmail: user?.email
    })
    
    // Try to get user profile
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      console.log('Profile check:', {
        hasProfile: !!profile,
        profileError,
        profile: profile ? {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role
        } : null
      })
    }
    
    return { session, user }
  } catch (error) {
    console.error('Auth debug error:', error)
    return { session: null, user: null, error }
  }
}