'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { Mail, Lock, Eye, EyeOff, Loader2, Mountain, AlertTriangle } from 'lucide-react'

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
  const [isSignUp, setIsSignUp] = useState(false)
  const [fullName, setFullName] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutTime, setLockoutTime] = useState<number>(0)
  const [remainingAttempts, setRemainingAttempts] = useState(MAX_LOGIN_ATTEMPTS)
  
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

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
    
    if (isLocked) {
      const remainingTime = Math.ceil((lockoutTime - Date.now()) / 1000 / 60)
      setError(`Account temporarily locked. Please try again in ${remainingTime} minutes.`)
      return
    }
    
    setLoading(true)
    setError('')

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        })
        
        if (error) throw error
        
        if (data.user) {
          setError('User created successfully! Check your email for confirmation.')
        } else {
          setError('User creation failed - no user returned')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        
        if (error) {
          recordLoginAttempt(false)
          throw error
        }
        
        recordLoginAttempt(true)
        router.push('/')
      }
    } catch (error: unknown) {
      if (!isSignUp) {
        const errorMessage = error instanceof Error ? error.message : 'An error occurred'
        setError(errorMessage)
      } else {
        setError(error instanceof Error ? error.message : 'An error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    
    if (error) {
      setError(error.message)
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
            {isSignUp ? 'Create Account' : 'Sign in to FWT Dashboard'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isSignUp ? 'Join the FWT community' : 'Access your dashboard'}
          </p>
        </div>

        {isLocked && (
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
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required={isSignUp}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                  disabled={isLocked}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Enter your email"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  disabled={isLocked}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
          </div>

          {!isLocked && remainingAttempts < MAX_LOGIN_ATTEMPTS && (
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
              disabled={loading || isLocked}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span>{isSignUp ? 'Create Account' : 'Sign in'}</span>
              )}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}