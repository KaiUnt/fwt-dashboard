import { jwtVerify, createRemoteJWKSet, decodeJwt, decodeProtectedHeader } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

export interface AuthenticatedUser {
  id: string
  email: string
  role?: string
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

// Supabase SSR client no longer used for API auth; we enforce Bearer verification only.

/**
 * Authenticate API request and return user info
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthenticatedUser> {
  try {
    // Require Authorization header for protected APIs
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) throw new AuthenticationError('Invalid or expired authentication')

    // Derive issuer from token and validate Supabase format
    const claims = decodeJwt(token)
    const issuer = (claims.iss as string) || ''
    if (!issuer || !issuer.startsWith('https://') || !issuer.endsWith('/auth/v1') || !issuer.includes('.supabase.co')) {
      throw new AuthenticationError('Invalid token issuer')
    }

    // Verify depending on algorithm (HS* uses project secret, RS* uses JWKS)
    const { alg } = decodeProtectedHeader(token)
    let payload: Record<string, unknown>
    if (typeof alg === 'string' && alg.toUpperCase().startsWith('HS')) {
      const secret = process.env.SUPABASE_JWT_SECRET
      if (!secret) throw new AuthenticationError('Authentication service unavailable')
      const encoder = new TextEncoder()
      const verified = await jwtVerify(token, encoder.encode(secret), { issuer })
      payload = verified.payload as unknown as Record<string, unknown>
    } else {
      const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
      const verified = await jwtVerify(token, jwks, { issuer })
      payload = verified.payload as unknown as Record<string, unknown>
    }

    const userId = (payload.sub as string) || ''
    const email = (payload.email as string) || ''
    if (!userId) throw new AuthenticationError('Invalid or expired authentication')

    // Enrich role from Supabase user_profiles via REST using the verified user token
    let role: string | undefined = 'user'
    try {
      const supabaseBase = issuer.replace(/\/auth\/v1$/, '')
      const restUrl = `${supabaseBase}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=role`
      const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const resp = await fetch(restUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(apikey ? { apikey } : {}),
          Accept: 'application/json',
        },
      })
      if (resp.ok) {
        const rows = (await resp.json()) as Array<{ role?: string }>
        const fetchedRole = rows?.[0]?.role
        if (typeof fetchedRole === 'string' && fetchedRole.length > 0) {
          role = fetchedRole
        }
      }
    } catch {
      // Non-fatal: default to 'user'
    }

    return { id: userId, email: email || 'unknown@user', role }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error
    }
    console.error('API Authentication service error:', error)
    throw new AuthenticationError('Authentication service unavailable')
  }
}

/**
 * Check if user has required role
 */
export function requireRole(user: AuthenticatedUser, requiredRole: string): void {
  
  if (requiredRole === 'admin' && user.role !== 'admin') {
    console.warn('Insufficient permissions:', {
      userId: user.id,
      userRole: user.role,
      requiredRole
    })
    throw new AuthorizationError('Admin access required')
  }
}

/**
 * Rate limiting store (in-memory for now)
 */
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Simple rate limiting
 */
function checkRateLimit(identifier: string, maxRequests: number, windowMs: number): void {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)
  
  // Clean up expired entry
  if (entry && now > entry.resetTime) {
    rateLimitStore.delete(identifier)
  }
  
  // Initialize or increment
  const current = rateLimitStore.get(identifier)
  if (!current) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs
    })
  } else {
    current.count++
    if (current.count > maxRequests) {
      throw new Error(`Rate limit exceeded: ${maxRequests} requests per ${windowMs / 1000} seconds`)
    }
  }
}

/**
 * Security middleware wrapper for API routes
 */
export function withAuth<T extends unknown[]>(
  handler: (user: AuthenticatedUser, ...args: T) => Promise<NextResponse>,
  options: {
    requireAdmin?: boolean
    rateLimit?: { maxRequests: number; windowMs: number }
  } = {}
) {
  return async (...args: T): Promise<NextResponse> => {
    const startTime = Date.now()
    
    try {
      // Extract request (should be first argument)
      const request = args[0] as NextRequest
      const ip = request.headers.get('x-forwarded-for') || 
                request.headers.get('x-real-ip') || 
                'unknown'
      
      // Apply rate limiting if configured
      if (options.rateLimit) {
        try {
          checkRateLimit(
            ip, 
            options.rateLimit.maxRequests, 
            options.rateLimit.windowMs
          )
        } catch {
          logSecurityEvent({
            type: 'rate_limit',
            ip,
            endpoint: request.nextUrl.pathname,
            userAgent: request.headers.get('user-agent') || 'unknown',
            timestamp: new Date().toISOString(),
            details: { 
              rateLimit: options.rateLimit 
            }
          })
          
          return NextResponse.json(
            { error: 'Too many requests. Please try again later.' },
            { 
              status: 429,
              headers: { 
                'Retry-After': Math.ceil(options.rateLimit.windowMs / 1000).toString()
              }
            }
          )
        }
      }
      
      // Authenticate user
      const user = await authenticateRequest(request)
      
      // Check admin role if required
      if (options.requireAdmin) {
        requireRole(user, 'admin')
      }
      
      // Check for suspicious activity
      const isSuspicious = detectSuspiciousActivity(ip, request.nextUrl.pathname, user)
      if (isSuspicious) {
        logSecurityEvent({
          type: 'suspicious_activity',
          userId: user.id,
          email: user.email,
          ip,
          endpoint: request.nextUrl.pathname,
          userAgent: request.headers.get('user-agent') || 'unknown',
          timestamp: new Date().toISOString(),
          details: { 
            userRole: user.role,
            suspiciousReason: 'Admin endpoint access by non-admin user'
          }
        })
      }

      // Log successful authentication
      logSecurityEvent({
        type: 'auth_success',
        userId: user.id,
        email: user.email,
        ip,
        endpoint: request.nextUrl.pathname,
        userAgent: request.headers.get('user-agent') || 'unknown',
        timestamp: new Date().toISOString(),
        details: { 
          method: request.method, 
          role: user.role 
        }
      })
      
      // Call the actual handler
      const response = await handler(user, ...args)
      
      // Log response time
      const _duration = Date.now() - startTime
      
      return response
      
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const request = args[0] as NextRequest
      
      if (error instanceof AuthenticationError) {
        logSecurityEvent({
          type: 'auth_failure',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          endpoint: request.nextUrl.pathname,
          userAgent: request.headers.get('user-agent') || 'unknown',
          timestamp: new Date().toISOString(),
          details: { 
            error: error.message, 
            duration 
          }
        })
        
        return NextResponse.json(
          { error: error.message },
          { status: 401 }
        )
      }
      
      if (error instanceof AuthorizationError) {
        console.warn('API Authorization failed:', {
          endpoint: request.nextUrl.pathname,
          error: error.message,
          duration
        })
        
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        )
      }
      
      // Log unexpected errors
      console.error('API Internal error:', {
        endpoint: request.nextUrl.pathname,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        duration
      })
      
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Predefined rate limits for different endpoint types
 */
export const RATE_LIMITS = {
  // General API endpoints
  standard: { maxRequests: 100, windowMs: 60000 }, // 100 req/min
  
  // Admin endpoints (more restrictive)
  admin: { maxRequests: 50, windowMs: 60000 }, // 50 req/min
  
  // Purchase/transaction endpoints (very restrictive)
  purchase: { maxRequests: 10, windowMs: 60000 }, // 10 req/min
  
  // Credit-related endpoints
  credits: { maxRequests: 30, windowMs: 60000 }, // 30 req/min
  
  // Profile/security sensitive endpoints
  profile: { maxRequests: 20, windowMs: 60000 }, // 20 req/min
  
  // Authentication endpoints
  auth: { maxRequests: 10, windowMs: 300000 }, // 10 req/5min
}

/**
 * Enhanced security logging
 */
interface SecurityLog {
  type: 'auth_success' | 'auth_failure' | 'rate_limit' | 'admin_action' | 'purchase_attempt' | 'suspicious_activity'
  userId?: string
  email?: string
  ip: string
  endpoint: string
  userAgent: string
  timestamp: string
  details?: Record<string, unknown>
}

function logSecurityEvent(_event: SecurityLog): void {
  
  // In production, send to external monitoring service
  // await sendToSecurityMonitoring(event)
}

/**
 * Detect suspicious patterns
 */
function detectSuspiciousActivity(
  ip: string, 
  endpoint: string, 
  user?: AuthenticatedUser
): boolean {
  // Check for admin endpoint access by non-admin users
  if (endpoint.includes('/admin/') && user?.role !== 'admin') {
    return true
  }
  
  // Check for rapid requests from same IP
  // (This is a simple implementation - in production use more sophisticated detection)
  
  return false
}
