import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security: Get client IP for logging (future use)
  const _ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  
  // Skip auth for API routes and PWA files
  if (pathname.startsWith('/api/auth') || 
      pathname.includes('sw.js') || 
      pathname.includes('workbox') ||
      pathname.includes('manifest.json')) {
    const response = NextResponse.next();
    // Add security headers even for skipped routes
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  // Basic Auth check with improved security
  const basicAuth = request.headers.get('authorization');

  if (!basicAuth) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="FWT Dashboard"',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const authValue = basicAuth.split(' ')[1];
    if (!authValue) throw new Error('Invalid auth format');
    
    const [user, pwd] = atob(authValue).split(':');

    // Security: Use environment variables for credentials
    const validUser = process.env.BASIC_AUTH_USER;
    const validPassword = process.env.BASIC_AUTH_PASSWORD;

    if (user !== validUser || pwd !== validPassword) {
      // Security: Add delay for failed attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return new Response('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="FWT Dashboard"',
          'Cache-Control': 'no-store',
        },
      });
    }
  } catch {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="FWT Dashboard"',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Get locale from cookie or header
  const locale = request.cookies.get('locale')?.value || 
                request.headers.get('accept-language')?.split(',')[0]?.split('-')[0] || 
                'de';

  // Check if locale is supported
  const supportedLocales = ['de', 'en', 'fr'];
  const activeLocale = supportedLocales.includes(locale) ? locale : 'de';

  // Set security headers and locale
  const response = NextResponse.next();
  response.headers.set('x-locale', activeLocale);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'private, no-cache');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js).*)',
  ],
};