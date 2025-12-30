import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Helper function to detect if request is offline/cached
function isOfflineRequest(request: NextRequest): boolean {
  // Check various indicators for offline state
  const cacheControl = request.headers.get('cache-control');
  const pragma = request.headers.get('pragma');
  const connection = request.headers.get('connection');
  
  // Service Worker offline indicators
  const isFromServiceWorker = request.headers.get('service-worker') === 'offline';
  const isCachedRequest = cacheControl?.includes('only-if-cached') || pragma === 'no-cache';
  
  return isFromServiceWorker || isCachedRequest || connection === 'offline';
}

// Helper function to check if user has offline data for requested path
function hasOfflineDataForPath(request: NextRequest, pathname: string): boolean {
  // Check if this is a dashboard route with potential offline data
  const isDashboardRoute = pathname.startsWith('/dashboard/');
  const isEventsRoute = pathname === '/';
  
  // For now, we'll allow access if there's an offline auth cookie
  // This can be enhanced to check actual offline data presence
  return isDashboardRoute || isEventsRoute;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security: Get client IP for logging
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Skip auth for public routes and PWA files
  const publicRoutes = [
    '/login',
    '/auth/callback',
    '/auth/update-password',
    '/api/auth',
    '/_next',
    '/favicon.ico',
    '/sw.js',
    '/workbox',
    '/manifest.json',
    '/locales',  // Translation files
    '/all_locations.csv'  // Static location data for event matching (no auth needed)
  ]

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  // Special handling for API routes - they handle their own auth
  if (pathname.startsWith('/api/') && !isPublicRoute) {
    // Add security headers for API routes but let them handle auth internally
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    
    
    return response;
  }
  
  if (isPublicRoute) {
    // Add security headers even for public routes
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  }

  // Create Supabase client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: Record<string, unknown>) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to login if not authenticated
  if (!user) {
    // Check for offline access with cached auth state
    const isOffline = isOfflineRequest(request);
    const offlineAuthState = request.cookies.get('offline-auth-state');
    const offlineAuthExpiry = request.cookies.get('offline-auth-expiry');
    
    if (isOffline && offlineAuthState && offlineAuthExpiry) {
      // Check if cached auth hasn't expired
      const expiryTime = parseInt(offlineAuthExpiry.value);
      const now = Date.now();
      
      if (now < expiryTime && hasOfflineDataForPath(request, pathname)) {
        // Allow access with cached auth state
        response.headers.set('x-offline-auth', 'true');
        return response;
      }
    }
    
    // Normal redirect to login for online requests or expired offline auth
    const url = new URL('/login', request.url)
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Log user activity only for event dashboard routes (reduce noise)
  if (!pathname.startsWith('/api') && pathname.startsWith('/dashboard/')) {
    try {
      await supabase.rpc('log_user_action', {
        p_action_type: 'page_view',
        p_resource_type: 'page',
        p_resource_id: pathname,
        p_action_details: {
          ip_address: ip,
          user_agent: request.headers.get('user-agent') || 'unknown'
        }
      })
    } catch (error) {
      // Silently fail activity logging to not block the request
      console.warn('Failed to log user activity:', error)
    }
  }

  // Get locale from cookie or header
  const locale = request.cookies.get('locale')?.value || 
                request.headers.get('accept-language')?.split(',')[0]?.split('-')[0] || 
                'de';

  // Check if locale is supported
  const supportedLocales = ['de', 'en', 'fr'];
  const activeLocale = supportedLocales.includes(locale) ? locale : 'de';

  // Set security headers and locale
  response.headers.set('x-locale', activeLocale);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'private, no-cache');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js|locales/).*)',
  ],
};
