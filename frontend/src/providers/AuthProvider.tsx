'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/supabase'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  isAdmin: boolean
  isCommentator: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      console.log('🔍 Fetching profile for user:', userId)
      
      // Add timeout for profile fetch (increased to 15 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 15000)
      })
      
      const fetchPromise = supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any
      
      if (error) {
        // PGRST116 means no rows returned, which is OK for new users
        if (error.code === 'PGRST116') {
          console.log('ℹ️ No profile found for user (new user):', userId)
          return null
        }
        
        // Log other errors but don't throw
        console.error('Error fetching profile:', error)
        return null
      }

      console.log('✅ Profile fetched successfully:', data)
      return data
    } catch (error) {
      console.error('Error fetching profile:', error)
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

    // Fallback timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (isInitialLoad) {
        console.warn('⏰ AuthProvider: Timeout reached, forcing loading to false')
        setLoading(false)
        isInitialLoad = false
      }
    }, 20000) // 20 seconds timeout

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 AuthProvider: Auth state changed:', { event, hasSession: !!session })
        
        // Set user immediately
        setUser(session?.user ?? null)
        
        try {
          if (session?.user) {
            console.log('✅ AuthProvider: User found, fetching profile...')
            const profile = await fetchProfile(session.user.id)
            console.log('📄 AuthProvider: Profile fetched:', profile)
            setProfile(profile)
          } else {
            console.log('❌ AuthProvider: No user found')
            setProfile(null)
          }
        } catch (error) {
          console.error('❌ AuthProvider: Error handling auth state change:', error)
          // Set profile to null on error to avoid hanging
          setProfile(null)
        } finally {
          // Always set loading to false, even on errors
          console.log('🏁 AuthProvider: Setting loading to false')
          setLoading(false)
          isInitialLoad = false
        }
      }
    )

    // Get initial session only if we haven't loaded yet
    const getInitialSession = async () => {
      if (!isInitialLoad) return
      
      console.log('🔄 AuthProvider: Getting initial session...')
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        console.log('📋 AuthProvider: Initial session data:', { session, error })
        
        // Only handle initial session if auth state change hasn't fired yet
        if (isInitialLoad) {
          setUser(session?.user ?? null)
          
          if (session?.user) {
            console.log('✅ AuthProvider: Initial user found, fetching profile...')
            const profile = await fetchProfile(session.user.id)
            console.log('📄 AuthProvider: Initial profile fetched:', profile)
            setProfile(profile)
          } else {
            setProfile(null)
          }
          
          setLoading(false)
          isInitialLoad = false
        }
      } catch (error) {
        console.error('❌ AuthProvider: Error getting initial session:', error)
        setLoading(false)
        isInitialLoad = false
      }
    }

    getInitialSession()

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [supabase.auth, fetchProfile])

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    }
  }

  const isAdmin = profile?.role === 'admin'
  const isCommentator = profile?.role === 'commentator' || profile?.role === 'admin'

  const value = {
    user,
    profile,
    loading,
    signOut,
    isAdmin,
    isCommentator,
    refreshProfile
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