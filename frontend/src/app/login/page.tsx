'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useCheckUsernameAvailability } from '@/hooks/useFriends'
import { Mail, Eye, EyeOff, Loader2, Mountain, AlertTriangle } from 'lucide-react'

// Rate limiting configuration
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes in milliseconds
const ATTEMPT_RESET_TIME = 60 * 60 * 1000 // 1 hour in milliseconds

interface LoginAttempt {
  timestamp: number
  email: string
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up' | 'forgot'>('sign-in')
  const [fullName, setFullName] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutTime, setLockoutTime] = useState<number>(0)
  const [remainingAttempts, setRemainingAttempts] = useState(MAX_LOGIN_ATTEMPTS)
  const [message, setMessage] = useState('')
  
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const checkUsernameAvailability = useCheckUsernameAvailability()

  // Check for existing lockout on component mount
  useEffect(() => {
    const storedLockout = localStorage.getItem('loginLockout')
    const storedAttempts = localStorage.getItem('loginAttempts')
    
    if (storedLockout) {
      const lockoutData = JSON.parse(storedLockout)
      const now = Date.now()
      
      if (now < lockoutData.until) {
        setIsLocked(true)
        setLockoutTime(lockoutData.until)
      } else {
        // Lockout expired, clear it
        localStorage.removeItem('loginLockout')
        setIsLocked(false)
      }
    }
    
    if (storedAttempts) {
      const attempts = JSON.parse(storedAttempts) as LoginAttempt[]
      const now = Date.now()
      const recentAttempts = attempts.filter(attempt => 
        now - attempt.timestamp < ATTEMPT_RESET_TIME
      )
      
      if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
        setIsLocked(true)
        setLockoutTime(now + LOCKOUT_DURATION)
      } else {
        setRemainingAttempts(MAX_LOGIN_ATTEMPTS - recentAttempts.length)
      }
    }
  }, [])

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.push('/')
    }
  }, [user, router])

  // Reset alerts when switching between auth modes
  useEffect(() => {
    setError('')
    setMessage('')
  }, [authMode])

  const recordLoginAttempt = (success: boolean) => {
    const now = Date.now()
    const storedAttempts = localStorage.getItem('loginAttempts')
    let attempts: LoginAttempt[] = storedAttempts ? JSON.parse(storedAttempts) : []
    
    // Remove old attempts (older than 1 hour)
    attempts = attempts.filter(attempt => now - attempt.timestamp < ATTEMPT_RESET_TIME)
    
    if (!success) {
      // Record failed attempt
      attempts.push({ timestamp: now, email })
      
      if (attempts.length >= MAX_LOGIN_ATTEMPTS) {
        // Lockout user
        const lockoutUntil = now + LOCKOUT_DURATION
        localStorage.setItem('loginLockout', JSON.stringify({ until: lockoutUntil }))
        setIsLocked(true)
        setLockoutTime(lockoutUntil)
        setError('Too many failed login attempts. Please try again in 15 minutes.')
      } else {
        setRemainingAttempts(MAX_LOGIN_ATTEMPTS - attempts.length)
        setError(`Login failed. ${remainingAttempts - 1} attempts remaining.`)
      }
    } else {
      // Clear attempts on successful login
      localStorage.removeItem('loginAttempts')
      localStorage.removeItem('loginLockout')
      setIsLocked(false)
      setRemainingAttempts(MAX_LOGIN_ATTEMPTS)
    }
    
    localStorage.setItem('loginAttempts', JSON.stringify(attempts))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (authMode === 'sign-in' && isLocked) {
      const remainingTime = Math.ceil((lockoutTime - Date.now()) / 1000 / 60)
      setError(`Account temporarily locked. Please try again in ${remainingTime} minutes.`)
      return
    }
    
    setLoading(true)
    setError('')

    try {
      if (authMode === 'sign-up') {
        // Client-side validations
        const trimmedName = fullName.trim()
        const desiredName = trimmedName || email.split('@')[0]

        if (desiredName.length < 3) {
          setError('Full name must be at least 3 characters')
          setLoading(false)
          return
        }

        // Pre-check username availability (non-auth endpoint)
        try {
          const availability = await checkUsernameAvailability.mutateAsync(desiredName)
          if (!availability.available) {
            setError('This name is already taken. Please choose another one.')
            setLoading(false)
            return
          }
        } catch (e) {
          // If availability check fails, still attempt signup but show soft warning
          console.warn('Username availability check failed:', e)
        }

        // Only include full_name in metadata if provided (avoid empty string in raw_user_meta_data)
        const signUpOptions = trimmedName
          ? { data: { full_name: trimmedName } }
          : undefined

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: signUpOptions
        })
        
        if (error) throw error
        
        if (data.user) {
          setMessage('User created successfully! Check your email for confirmation.')
        } else {
          setError('User creation failed - no user returned')
        }
      } else if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        
        if (error) {
          recordLoginAttempt(false)
          // Map duplicate/validation errors to friendly message
          const msg = (error?.message || '').toLowerCase()
          if (msg.includes('duplicate key') || msg.includes('unique') || msg.includes('already exists')) {
            setError('This name is already taken. Please choose another one.')
          } else if (msg.includes('username is required') || msg.includes('full_name')) {
            setError('Please provide a valid full name (3-50 characters).')
          } else {
            throw error
          }
          setLoading(false)
          return
        }
        
        recordLoginAttempt(true)
        router.push('/')
      } else if (authMode === 'forgot') {
        const targetEmail = email.trim()
        if (!targetEmail) {
          setError('Please enter your email to receive a reset link.')
          return
        }
        await supabase.auth.resetPasswordForEmail(targetEmail, {
          redirectTo: `${window.location.origin}/auth/update-password`
        })
        setMessage('If an account exists, we have sent a password reset link to your email.')
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }



  const formatTimeRemaining = () => {
    if (!isLocked) return ''
    const remaining = Math.ceil((lockoutTime - Date.now()) / 1000 / 60)
    return `${remaining} minutes`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
            <Mountain className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            {authMode === 'sign-up' ? 'Create Account' : authMode === 'forgot' ? 'Reset your password' : 'Sign in to FWT Dashboard'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {authMode === 'sign-up' ? 'Join the FWT community' : authMode === 'forgot' ? 'Enter your email to receive a reset link' : 'Access your dashboard'}
          </p>
        </div>

        {authMode === 'sign-in' && isLocked && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Account Temporarily Locked
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>Too many failed login attempts.</p>
                  <p>Please try again in {formatTimeRemaining()}.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {message && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-800">{message}</p>
              </div>
            )}
            {authMode === 'sign-up' && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required={authMode === 'sign-up'}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-950"
                  placeholder="Enter your full name"
                />
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={authMode === 'sign-in' && isLocked}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-950"
                  placeholder="Enter your email"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>

            {authMode !== 'forgot' && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
                  required
                  disabled={authMode === 'sign-in' && isLocked}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-950"
                  placeholder="Enter your password"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>

          {authMode === 'sign-in' && !isLocked && remainingAttempts < MAX_LOGIN_ATTEMPTS && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ {remainingAttempts} login attempts remaining
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || (authMode === 'sign-in' && isLocked)}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span>{authMode === 'sign-up' ? 'Create Account' : authMode === 'forgot' ? 'Send reset link' : 'Sign in'}</span>
              )}
            </button>
            {authMode === 'sign-in' && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:text-blue-500"
                  onClick={() => { setError(''); setMessage(''); setAuthMode('forgot') }}
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {authMode !== 'forgot' ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in')
                  setError('')
                  setMessage('')
                }}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                {authMode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          ) : (
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setAuthMode('sign-in'); setError(''); setMessage('') }}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Back to Sign in
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}