export type ApiFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /**
   * Optional function to lazily retrieve an access token.
   * If provided and no Authorization header is set, this will be used to attach a Bearer token.
   */
  getAccessToken?: () => Promise<string | null>;
  /**
   * Content type for request body. Set to null to avoid setting Content-Type.
   */
  contentType?: 'json' | 'form' | null;
  /**
   * Request timeout in milliseconds.
   */
  timeoutMs?: number;
};

export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Unified fetch helper with auth, JSON handling and timeout.
 * - If `path` is relative (does not start with http), it will be requested against the same origin (e.g., Next API routes).
 * - Automatically attaches Authorization header if `getAccessToken` is provided and header is not already set.
 * - Serializes JSON body and parses JSON responses when possible.
 */
export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    getAccessToken,
    contentType = 'json',
    timeoutMs = 60000,
  } = options;

  const finalHeaders: Record<string, string> = { ...headers };

  // Debug mode only in development - cannot be enabled in production via console
  const DEBUG = process.env.NODE_ENV === 'development' && (
    (typeof window !== 'undefined' && (window as unknown as { __FWT_DEBUG_LOAD__?: boolean }).__FWT_DEBUG_LOAD__ === true) ||
    process.env.NEXT_PUBLIC_DEBUG_LOAD === '1'
  );

  // Attach Authorization header if not present and token provider is given
  if (!finalHeaders['Authorization'] && getAccessToken) {
    try {
      if (DEBUG) console.time(`[auth] getAccessToken`)
      const token = await getAccessToken();
      if (DEBUG) console.timeEnd(`[auth] getAccessToken`)
      if (token) {
        finalHeaders['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Non-fatal: continue without auth header
    }
  }

  let requestBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (contentType === 'json') {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
      requestBody = JSON.stringify(body);
    } else if (contentType === 'form' && body instanceof FormData) {
      requestBody = body as FormData;
      // Let the browser set proper multipart boundaries
    } else if (contentType === null) {
      // Raw body without content type
      requestBody = body as BodyInit;
    } else {
      // Default to JSON when unknown object is passed
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isAbsolute = /^https?:\/\//i.test(path);
    const url = isAbsolute ? path : path; // relative paths go to same origin (Next.js API)

    if (DEBUG) console.time(`[api] ${method} ${url}`)
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: requestBody,
      signal: controller.signal,
    });
    if (DEBUG) console.timeEnd(`[api] ${method} ${url}`)

    // Try to parse JSON when content-type indicates JSON
    const contentTypeHeader = response.headers.get('content-type') || '';
    const isJson = contentTypeHeader.includes('application/json');

    if (!response.ok) {
      let detail: unknown = undefined;
      try {
        detail = isJson ? await response.json() : await response.text();
      } catch {
        // no-op
      }

      const status = response.status;
      const message =
        status === 401
          ? 'Unauthorized'
          : status === 403
          ? 'Forbidden'
          : status === 404
          ? 'Not Found'
          : status === 409
          ? 'Conflict'
          : status >= 500
          ? 'Server Error'
          : `HTTP Error ${status}`;
      throw new ApiError(message, status, detail);
    }

    if (isJson) {
      // If no content (204), return undefined as any
      if (response.status === 204) return undefined as unknown as T;
      if (DEBUG) console.time(`[api-parse] ${method} ${url}`)
      const parsed = (await response.json()) as T;
      if (DEBUG) console.timeEnd(`[api-parse] ${method} ${url}`)
      return parsed;
    }

    // For non-JSON responses, return as text
    const text = await response.text();
    return text as unknown as T;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new ApiError('Request timeout', 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
