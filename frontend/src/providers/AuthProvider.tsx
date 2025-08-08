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
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      })
      
      const fetchPromise = (async () => {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single()
        
        if (error) {
          // PGRST116 means no rows returned, which is OK for new users
          if (error.code === 'PGRST116') {
            return null
          }
          
          // Log other errors but don't throw
          console.error('Error fetching profile:', error)
          return null
        }

        return data
      })()
      
      const result = await Promise.race([fetchPromise, timeoutPromise])
      return result
    } catch (error) {
      console.error('Error in fetchProfile:', error)
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
            const profile = await fetchProfile(session.user.id)
            if (mounted) {
              setProfile(profile)
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
        
        try {
          if (session?.user) {
            const profile = await fetchProfile(session.user.id)
            if (mounted) {
              setProfile(profile)
              // Only set loading to false AFTER profile is set
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