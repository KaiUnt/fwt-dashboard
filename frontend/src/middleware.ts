import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
    '/api/auth',
    '/_next',
    '/favicon.ico',
    '/sw.js',
    '/workbox',
    '/manifest.json'
  ]

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  if (isPublicRoute) {
    // Add security headers even for public routes
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
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
    const url = new URL('/login', request.url)
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Log user activity for non-API routes
  if (!pathname.startsWith('/api')) {
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
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js).*)',
  ],
};