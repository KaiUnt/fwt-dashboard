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
    try {
      console.log('Fetching profile for user:', userId)
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 15000) // Increased timeout
      })
      
      const fetchPromise = (async () => {
        console.log('Making Supabase query for profile...')
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single()
        
        console.log('Supabase profile query result:', { data, error })
        
        if (error) {
          // PGRST116 means no rows returned, which is OK for new users
          if (error.code === 'PGRST116') {
            console.log('No profile found for user (PGRST116)')
            return null
          }
          
          // Log other errors but don't throw
          console.error('Error fetching profile:', error)
          return null
        }

        console.log('Profile fetched successfully:', data)
        return data
      })()
      
      const result = await Promise.race([fetchPromise, timeoutPromise])
      return result
    } catch (error) {
      console.error('Error in fetchProfile:', error)
      // On timeout or any error, just return null - don't access profile here
      if (error instanceof Error && error.message === 'Profile fetch timeout') {
        console.warn('Profile fetch timeout - will keep existing profile state')
      }
      return null
    }
  }, [supabase]) // ← REMOVED profile dependency!

  const refreshProfile = async () => {
    if (user) {
      const fetchedProfile = await fetchProfile(user.id)
      // Only update if we got a result (not timeout)
      if (fetchedProfile !== null) {
        setProfile(fetchedProfile)
      }
    }
  }

  useEffect(() => {
    let isInitialLoad = true
    let mounted = true

    const initializeAuth = async () => {
      try {
        // First, try to get current session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (!mounted) return
        
        if (error) {
          console.error('Error getting session:', error)
        }

        // Set user from current session if available
        if (session?.user) {
          setUser(session.user)
          setOfflineAuthState(session.user)
          
          try {
            const fetchedProfile = await fetchProfile(session.user.id)
            if (mounted) {
              // Only update profile if we got a result (not timeout)
              if (fetchedProfile !== null) {
                setProfile(fetchedProfile)
              }
              // On timeout (null), keep existing profile
            }
          } catch (profileError) {
            console.error('Error fetching profile during init:', profileError)
            if (mounted) {
              setProfile(null)
            }
          }
        } else {
          // No session, check offline auth
          const offlineAuth = getOfflineAuthState()
          if (offlineAuth.isValid && offlineAuth.userId) {
            // Keep user null but don't show as loading for offline
            setUser(null)
            setProfile(null)
          } else {
            setUser(null)
            setProfile(null)
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        if (mounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) {
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
        if (!mounted) return
        
        // Set user immediately
        setUser(session?.user ?? null)
        
        // Cache auth state for offline use
        setOfflineAuthState(session?.user ?? null)
        
        // Only fetch profile on actual auth changes, not on token refreshes
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          try {
            if (session?.user) {
              const fetchedProfile = await fetchProfile(session.user.id)
              if (mounted) {
                // Only update profile if we got a result (not timeout)
                if (fetchedProfile !== null) {
                  setProfile(fetchedProfile)
                }
                // On timeout (null), keep existing profile
                setLoading(false)
                isInitialLoad = false
              }
            } else {
              if (mounted) {
                setProfile(null)
                setLoading(false)
                isInitialLoad = false
              }
            }
          } catch (error) {
            console.error('Error handling auth state change:', error)
            if (mounted) {
              setProfile(null)
              setLoading(false)
              isInitialLoad = false
            }
          }
        } else {
          // For token refreshes and other events, just update loading state if needed
          if (isInitialLoad && mounted) {
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