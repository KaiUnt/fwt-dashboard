import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Basic Auth check
  const basicAuth = request.headers.get('authorization');

  if (!basicAuth) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="FWT Dashboard"',
      },
    });
  }

  const authValue = basicAuth.split(' ')[1];
  const [user, pwd] = atob(authValue).split(':');

  // Check credentials (replace with your desired username/password)
  const validUser = process.env.BASIC_AUTH_USER || 'admin';
  const validPassword = process.env.BASIC_AUTH_PASSWORD || 'fwt2025';

  if (user !== validUser || pwd !== validPassword) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="FWT Dashboard"',
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

  // Set locale in response headers
  const response = NextResponse.next();
  response.headers.set('x-locale', activeLocale);

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};