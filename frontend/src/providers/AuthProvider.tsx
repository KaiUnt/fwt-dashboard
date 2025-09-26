'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/supabase'
import { useQueryClient } from '@tanstack/react-query'

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
  // Access token helpers
  accessToken: string | null
  accessTokenExpiresAt: number | null
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(null)
  const supabase = createClient()
  const queryClient = useQueryClient()
  // Deduplicate concurrent session/token fetches
  const inFlightSessionRef = useRef<Promise<Session | null> | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 15000) // Increased timeout
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
          return null
        }

        return data
      })()
      
      const result = await Promise.race([fetchPromise, timeoutPromise])
      return result
    } catch (error) {
      // On timeout or any error, just return null - don't access profile here
      if (error instanceof Error && error.message === 'Profile fetch timeout') {
        // no-op
      }
      return null
    }
  }, [supabase]) // ← REMOVED profile dependency!

  // Single-flight wrapper for Supabase getSession to avoid concurrent duplicate calls
  const getSessionOnce = useCallback(async (): Promise<Session | null> => {
    if (inFlightSessionRef.current) {
      return inFlightSessionRef.current
    }
    const p = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        return session ?? null
      } catch {
        return null
      }
    })()
    inFlightSessionRef.current = p
    try {
      return await p
    } finally {
      inFlightSessionRef.current = null
    }
  }, [supabase.auth])

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
        // First, try to get current session (single-flight cached)
        const session = await getSessionOnce()
        
        if (!mounted) return

        // Set user from current session if available
        if (session?.user) {
          setUser(session.user)
          setOfflineAuthState(session.user)
          // Initialize token cache
          setAccessToken(session.access_token ?? null)
          // Supabase returns expires_at in seconds; convert to ms
          setAccessTokenExpiresAt(session.expires_at ? session.expires_at * 1000 : null)
          
          try {
            const fetchedProfile = await fetchProfile(session.user.id)
            if (mounted) {
              // Only update profile if we got a result (not timeout)
              if (fetchedProfile !== null) {
                setProfile(fetchedProfile)
              }
              // On timeout (null), keep existing profile
            }
          } catch {
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
          // Clear token cache when no session
          setAccessToken(null)
          setAccessTokenExpiresAt(null)
        }
      } catch {
        if (mounted) {
          setUser(null)
          setProfile(null)
          setAccessToken(null)
          setAccessTokenExpiresAt(null)
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
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return
        
        // Set user immediately
        setUser(session?.user ?? null)
        
        // Cache auth state for offline use
        setOfflineAuthState(session?.user ?? null)
        // Update token cache on any auth change
        setAccessToken(session?.access_token ?? null)
        setAccessTokenExpiresAt(session?.expires_at ? session.expires_at * 1000 : null)
        
        // Only fetch profile on actual auth changes, not on token refreshes
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          // Only clear cache on SIGNED_OUT to avoid nuking global queries (e.g., translations) on fresh tab loads
          if (event === 'SIGNED_OUT') {
            try {
              queryClient.clear()
            } catch {}
          }
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
          } catch {
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
      // no-op
    }
    
    // Clear offline auth state
    setOfflineAuthState(null)
    // Clear token cache
    setAccessToken(null)
    setAccessTokenExpiresAt(null)
    // Clear all react-query cache to remove user A data before user B logs in
    try {
      queryClient.clear()
    } catch {}
  }

  const isAdmin = profile?.role === 'admin'
  const isCommentator = profile?.role === 'commentator' || profile?.role === 'admin'
  
  // Check offline auth validity
  const offlineAuth = getOfflineAuthState()
  const isOfflineAuthValid = offlineAuth.isValid

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const safetyWindowMs = 60_000 // 60 seconds
      const now = Date.now()
      if (accessToken && accessTokenExpiresAt && now < (accessTokenExpiresAt - safetyWindowMs)) {
        return accessToken
      }
      // Ask Supabase for the current session via single-flight helper (may refresh token)
      const session = await getSessionOnce()
      const newToken = session?.access_token ?? null
      const newExpiry = session?.expires_at ? session.expires_at * 1000 : null
      setAccessToken(newToken)
      setAccessTokenExpiresAt(newExpiry)
      return newToken
    } catch {
      return null
    }
  }, [accessToken, accessTokenExpiresAt, getSessionOnce])

  const value = {
    user,
    profile,
    loading,
    signOut,
    isAdmin,
    isCommentator,
    refreshProfile,
    getOfflineAuthState,
    isOfflineAuthValid,
    accessToken,
    accessTokenExpiresAt,
    getAccessToken,
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

// Convenience hook to access a fresh access token with in-memory caching
export function useAccessToken() {
  const { getAccessToken, accessToken } = useAuth()
  return { getAccessToken, accessToken }
}
