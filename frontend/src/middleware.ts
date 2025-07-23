import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};