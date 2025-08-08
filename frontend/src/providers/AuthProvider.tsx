'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/supabase'

// Helper functions for offline auth state caching
const setOfflineAuthState = (user: User | null) => {
  if (typeof window === 'undefined') return;
  
  if (user) {
    // Cache auth state for offline use (7 days)
    const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
    document.cookie = `offline-auth-state=${user.id}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    document.cookie = `offline-auth-expiry=${expiryTime}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  } else {
    // Clear offline auth state
    document.cookie = 'offline-auth-state=; path=/; max-age=0';
    document.cookie = 'offline-auth-expiry=; path=/; max-age=0';
  }
};

const getOfflineAuthState = (): { isValid: boolean; userId?: string } => {
  if (typeof window === 'undefined') return { isValid: false };
  
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  
  const authState = cookies['offline-auth-state'];
  const authExpiry = cookies['offline-auth-expiry'];
  
  if (authState && authExpiry) {
    const expiryTime = parseInt(authExpiry);
    const now = Date.now();
    
    if (now < expiryTime) {
      return { isValid: true, userId: authState };
    }
  }
  
  return { isValid: false };
};

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  isAdmin: boolean
  isCommentator: boolean
  refreshProfile: () => Promise<void>
  // Offline auth helpers
  getOfflineAuthState: () => { isValid: boolean; userId?: string }
  isOfflineAuthValid: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchProfile = useCallback(async (userId: string) => {
    console.log('🔍 [AuthProvider] fetchProfile called for userId:', userId)
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      })
      
      const fetchPromise = (async () => {
        console.log('📡 [AuthProvider] Making profile query to supabase...')
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single()
        
        console.log('📡 [AuthProvider] Profile query result:', {
          hasData: !!data,
          error: error?.message,
          errorCode: error?.code,
          data: data ? { role: data.role, full_name: data.full_name } : null
        })
        
        if (error) {
          // PGRST116 means no rows returned, which is OK for new users
          if (error.code === 'PGRST116') {
            console.log('ℹ️ [AuthProvider] No profile found (PGRST116), returning null')
            return null
          }
          
          // Log other errors but don't throw
          console.error('❌ [AuthProvider] Error fetching profile:', error)
          return null
        }

        console.log('✅ [AuthProvider] Profile fetched successfully:', data?.full_name)
        return data
      })()
      
      const result = await Promise.race([fetchPromise, timeoutPromise])
      return result
    } catch (error) {
      console.error('💥 [AuthProvider] Exception in fetchProfile:', error)
      return null
    }
  }, [supabase])

  const refreshProfile = async () => {
    if (user) {
      const profile = await fetchProfile(user.id)
      setProfile(profile)
    }
  }

  useEffect(() => {
    let isInitialLoad = true
    let mounted = true

    const initializeAuth = async () => {
      console.log('🔄 [AuthProvider] Initializing auth...')
      try {
        // First, try to get current session
        console.log('🔍 [AuthProvider] Getting current session...')
        const { data: { session }, error } = await supabase.auth.getSession()
        
        console.log('📋 [AuthProvider] Session result:', {
          hasSession: !!session,
          hasUser: !!session?.user,
          userId: session?.user?.id,
          error: error?.message
        })
        
        if (!mounted) {
          console.log('⚠️ [AuthProvider] Component unmounted, aborting init')
          return
        }
        
        if (error) {
          console.error('❌ [AuthProvider] Error getting session:', error)
        }

        // Set user from current session if available
        if (session?.user) {
          console.log('✅ [AuthProvider] Setting user from session:', session.user.email)
          setUser(session.user)
          setOfflineAuthState(session.user)
          
          try {
            console.log('👤 [AuthProvider] Fetching profile for user:', session.user.id)
            const profile = await fetchProfile(session.user.id)
            console.log('👤 [AuthProvider] Profile result:', {
              hasProfile: !!profile,
              profileRole: profile?.role,
              profileName: profile?.full_name
            })
            if (mounted) {
              setProfile(profile)
            }
          } catch (profileError) {
            console.error('❌ [AuthProvider] Error fetching profile during init:', profileError)
            if (mounted) {
              setProfile(null)
            }
          }
        } else {
          console.log('❌ [AuthProvider] No session found, checking offline auth...')
          // No session, check offline auth
          const offlineAuth = getOfflineAuthState()
          console.log('💾 [AuthProvider] Offline auth state:', offlineAuth)
          if (offlineAuth.isValid && offlineAuth.userId) {
            console.log('💾 [AuthProvider] Valid offline auth found, keeping auth null but not loading')
            // Keep user null but don't show as loading for offline
            setUser(null)
            setProfile(null)
          } else {
            console.log('❌ [AuthProvider] No valid auth found, setting to null')
            setUser(null)
            setProfile(null)
          }
        }
      } catch (error) {
        console.error('💥 [AuthProvider] Error initializing auth:', error)
        if (mounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) {
          console.log('✅ [AuthProvider] Auth initialization complete, setting loading to false')
          setLoading(false)
          isInitialLoad = false
        }
      }
    }

    // Initialize auth immediately
    initializeAuth()

    // Fallback timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (isInitialLoad && mounted) {
        setLoading(false)
        isInitialLoad = false
      }
    }, 10000) // Reduced to 10 seconds timeout

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔔 [AuthProvider] Auth state change:', {
          event,
          hasUser: !!session?.user,
          userId: session?.user?.id,
          email: session?.user?.email
        })
        
        if (!mounted) {
          console.log('⚠️ [AuthProvider] Component unmounted, ignoring auth change')
          return
        }
        
        // Set user immediately
        console.log('👤 [AuthProvider] Setting user in state:', session?.user?.email || 'null')
        setUser(session?.user ?? null)
        
        // Cache auth state for offline use
        setOfflineAuthState(session?.user ?? null)
        
        try {
          if (session?.user) {
            console.log('👤 [AuthProvider] Auth change - fetching profile...')
            const profile = await fetchProfile(session.user.id)
            console.log('👤 [AuthProvider] Auth change - profile result:', {
              hasProfile: !!profile,
              profileRole: profile?.role
            })
            if (mounted) {
              setProfile(profile)
              // Only set loading to false AFTER profile is set
              setLoading(false)
              isInitialLoad = false
            }
          } else {
            console.log('❌ [AuthProvider] Auth change - no user, setting profile to null')
            if (mounted) {
              setProfile(null)
              setLoading(false)
              isInitialLoad = false
            }
          }
        } catch (error) {
          console.error('❌ [AuthProvider] Error handling auth state change:', error)
          // Set profile to null on error to avoid hanging
          if (mounted) {
            setProfile(null)
            setLoading(false)
            isInitialLoad = false
          }
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [supabase.auth, fetchProfile])

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    }
    
    // Clear offline auth state
    setOfflineAuthState(null)
  }

  const isAdmin = profile?.role === 'admin'
  const isCommentator = profile?.role === 'commentator' || profile?.role === 'admin'
  
  // Check offline auth validity
  const offlineAuth = getOfflineAuthState()
  const isOfflineAuthValid = offlineAuth.isValid

  const value = {
    user,
    profile,
    loading,
    signOut,
    isAdmin,
    isCommentator,
    refreshProfile,
    getOfflineAuthState,
    isOfflineAuthValid
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}