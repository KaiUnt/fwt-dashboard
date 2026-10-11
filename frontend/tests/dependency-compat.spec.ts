import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  AuthenticationError,
  AuthorizationError,
  requireRole,
} from '../src/lib/auth-middleware';
import { proxy } from '../src/proxy';

const TEST_SECRET = 'dependency-test-only-hs256-secret-64-characters-not-a-real-secret';
const TEST_ISSUER = 'https://dependency-test.supabase.co/auth/v1';
const TEST_USER_ID = 'b885ac5b-93fc-4980-872c-f42559b767df';
const TEST_EMAIL = 'dependency-test@example.invalid';
const TEST_ANON_KEY = 'dependency-test-only-anon-key';

async function signToken(options: { secret?: string; expiresAt?: number } = {}) {
  return new SignJWT({ email: TEST_EMAIL, role: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(TEST_ISSUER)
    .setSubject(TEST_USER_ID)
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1000) + 300)
    .sign(new TextEncoder().encode(options.secret ?? TEST_SECRET));
}

function authenticatedRequest(token?: string) {
  return new NextRequest('https://dashboard.example.invalid/api/admin/overview', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// These tests execute the real JWT/proxy code in Node. Every remote request is
// intercepted, and test-only environment values are restored after each test.
test.describe('Dependency compatibility: JWT verification and request proxy', () => {
  test.describe.configure({ mode: 'serial' });

  let originalFetch: typeof globalThis.fetch;
  let originalEnv: Record<string, string | undefined>;
  let fetchedRole: string;
  let requests: Array<{ url: string; headers: Headers }>;
  let respondToFetch: (url: string, init?: RequestInit) => Promise<Response>;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = {
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    };
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = TEST_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_ISSUER.replace('/auth/v1', '');
    fetchedRole = 'admin';
    requests = [];
    respondToFetch = async (url) => {
      if (url !== `${TEST_ISSUER.replace('/auth/v1', '')}/rest/v1/user_profiles?id=eq.${TEST_USER_ID}&select=role`) {
        throw new Error(`Unexpected network request: ${url}`);
      }
      return Response.json([{ role: fetchedRole }]);
    };

    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      return respondToFetch(url, init);
    };
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('verifies an HS256 token and obtains the admin role from the profile response', async () => {
    const token = await signToken();
    const user = await authenticateRequest(authenticatedRequest(token));

    expect(user).toEqual({ id: TEST_USER_ID, email: TEST_EMAIL, role: 'admin' });
    expect(() => requireRole(user, 'admin')).not.toThrow();
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(requests[0].headers.get('apikey')).toBe(TEST_ANON_KEY);
  });

  test('does not grant admin access to a verified non-admin profile', async () => {
    fetchedRole = 'commentator';
    const user = await authenticateRequest(authenticatedRequest(await signToken()));

    expect(user.role).toBe('commentator');
    expect(() => requireRole(user, 'admin')).toThrow(AuthorizationError);
  });

  test('rejects a missing Bearer token before making any profile request', async () => {
    await expect(authenticateRequest(authenticatedRequest())).rejects.toBeInstanceOf(AuthenticationError);
    expect(requests).toHaveLength(0);
  });

  test('rejects a token signed with a different secret before profile lookup', async () => {
    const token = await signToken({ secret: 'another-test-only-hs256-secret-with-at-least-32-characters' });

    await expect(authenticateRequest(authenticatedRequest(token))).rejects.toBeInstanceOf(AuthenticationError);
    expect(requests).toHaveLength(0);
  });

  test('rejects an expired signed token before profile lookup', async () => {
    const token = await signToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });

    await expect(authenticateRequest(authenticatedRequest(token))).rejects.toBeInstanceOf(AuthenticationError);
    expect(requests).toHaveLength(0);
  });

  test('refreshes an expired SSR session and propagates renewed cookies to response and request', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await signToken({ expiresAt: now - 60 });
    const freshToken = await signToken();
    const cookieName = 'sb-dependency-test-auth-token';
    const user = {
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const expiredSession = {
      access_token: expiredToken,
      refresh_token: 'dependency-test-expired-refresh-token',
      expires_at: now - 60,
      expires_in: 300,
      token_type: 'bearer',
      user,
    };
    const cookieValue = `base64-${Buffer.from(JSON.stringify(expiredSession)).toString('base64url')}`;
    respondToFetch = async (url, init) => {
      if (url === `${TEST_ISSUER}/token?grant_type=refresh_token`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          refresh_token: expiredSession.refresh_token,
        });
        return Response.json({
          access_token: freshToken,
          refresh_token: 'dependency-test-renewed-refresh-token',
          expires_in: 300,
          token_type: 'bearer',
          user,
        });
      }
      if (url === `${TEST_ISSUER}/user`) return Response.json(user);
      throw new Error(`Unexpected network request: ${url}`);
    };

    const request = new NextRequest('https://dashboard.example.invalid/protected-test', {
      headers: { Cookie: `${cookieName}=${cookieValue}` },
    });
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Location')).toBeNull();
    const cacheControl = response.headers.get('Cache-Control');
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('must-revalidate');
    expect(cacheControl).toContain('max-age=0');
    expect(response.headers.get('Expires')).toBe('0');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(requests.some(({ url }) => url === `${TEST_ISSUER}/token?grant_type=refresh_token`)).toBeTruthy();
    const renewedCookie = response.cookies.get(cookieName);
    expect(renewedCookie).toBeDefined();
    expect(request.cookies.get(cookieName)?.value).toBe(renewedCookie?.value);
    expect(response.headers.get('x-middleware-request-cookie')).toContain(`${cookieName}=${renewedCookie!.value}`);
    const persistedSession = JSON.parse(Buffer.from(renewedCookie!.value.replace(/^base64-/, ''), 'base64url').toString());
    expect(persistedSession.refresh_token).toBe('dependency-test-renewed-refresh-token');
    expect(persistedSession.access_token).toBe(freshToken);
  });

  test('redirects a protected route to login when Supabase configuration is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await proxy(new NextRequest('https://dashboard.example.invalid/dashboard/test-event'));
    const location = new URL(response.headers.get('Location')!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirectTo')).toBe('/dashboard/test-event');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(requests).toHaveLength(0);
  });

  test('keeps the login route available without Supabase configuration', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await proxy(new NextRequest('https://dashboard.example.invalid/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(requests).toHaveLength(0);
  });
});
