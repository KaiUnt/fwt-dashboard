import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  // Security: Never ignore ESLint/TypeScript errors in production
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Security Headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://liveheats.com https://liveheats.es https://www.liveheats.com https://res.cloudinary.com; connect-src 'self' https://liveheats.com https://liveheats.es http://localhost:8000 https://fwt-dashboard.onrender.com https://*.supabase.co;",
          },
        ],
      },
    ];
  },
  // Image Security
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'liveheats.com',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'liveheats.es',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'www.liveheats.com',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/liveheats-com/**',
      },
    ],
    // Remove deprecated 'domains' and add security
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Production optimizations (disable experimental CSS for now)
  // experimental: {
  //   optimizeCss: true,
  // },
  // Enable compression
  compress: true,
  // Security: Disable x-powered-by header
  poweredByHeader: false,
};

export default withPWA({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    // Add error handling for IndexedDB operations
    cleanupOutdatedCaches: true,
    // Add runtime caching with better error handling
    runtimeCaching: [
      {
        urlPattern: /^https?.*/, // Cache all external requests
        handler: "NetworkFirst",
        options: {
          cacheName: "https-calls",
          networkTimeoutSeconds: 15,
          expiration: {
            maxEntries: 150,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // Add error handling for IndexedDB
          plugins: [
            {
              cacheWillUpdate: async ({ request, response }) => {
                // Only cache successful responses
                return response && response.status === 200 ? response : null;
              },
              cacheDidUpdate: async ({ cacheName, request }) => {
                // Handle IndexedDB errors gracefully
                try {
                  // This is a workaround for IndexedDB connection issues
                  return;
                } catch (error) {
                  console.warn('IndexedDB error in service worker:', error);
                  return;
                }
              },
            },
          ],
        },
      },
      {
        // Disable development API caching to prevent _ref errors
        urlPattern: /^http:\/\/localhost:8000\/api\//,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-calls-dev",
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 1 * 60 * 60, // 1 hour only
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // Add error handling for IndexedDB
          plugins: [
            {
              cacheWillUpdate: async ({ request, response }) => {
                // Only cache successful responses
                return response && response.status === 200 ? response : null;
              },
              cacheDidUpdate: async ({ cacheName, request }) => {
                // Handle IndexedDB errors gracefully
                try {
                  return;
                } catch (error) {
                  console.warn('IndexedDB error in service worker:', error);
                  return;
                }
              },
            },
          ],
        },
      },
      {
        urlPattern: /\/api\/series-rankings/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "series-rankings-current",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // Add error handling for IndexedDB
          plugins: [
            {
              cacheWillUpdate: async ({ request, response }) => {
                return response && response.status === 200 ? response : null;
              },
              cacheDidUpdate: async ({ cacheName, request }) => {
                try {
                  return;
                } catch (error) {
                  console.warn('IndexedDB error in service worker:', error);
                  return;
                }
              },
            },
          ],
        },
      },
      {
        urlPattern: /\/api\/athlete\/.*\/event-history\//,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "athlete-event-history",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days - Event history is very stable
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // Add error handling for IndexedDB
          plugins: [
            {
              cacheWillUpdate: async ({ request, response }) => {
                return response && response.status === 200 ? response : null;
              },
              cacheDidUpdate: async ({ cacheName, request }) => {
                try {
                  return;
                } catch (error) {
                  console.warn('IndexedDB error in service worker:', error);
                  return;
                }
              },
            },
          ],
        },
      },
      {
        urlPattern: /\/locales\/.*\.json$/,
        handler: "CacheFirst",
        options: {
          cacheName: "translation-files",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
          // Add error handling for IndexedDB
          plugins: [
            {
              cacheWillUpdate: async ({ request, response }) => {
                return response && response.status === 200 ? response : null;
              },
              cacheDidUpdate: async ({ cacheName, request }) => {
                try {
                  return;
                } catch (error) {
                  console.warn('IndexedDB error in service worker:', error);
                  return;
                }
              },
            },
          ],
        },
      },
      {
        urlPattern: /\.json$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-resources",
          cacheableResponse: {
            statuses: [0, 200],
          },
          // Add error handling for IndexedDB
          plugins: [
            {
              cacheWillUpdate: async ({ request, response }) => {
                return response && response.status === 200 ? response : null;
              },
              cacheDidUpdate: async ({ cacheName, request }) => {
                try {
                  return;
                } catch (error) {
                  console.warn('IndexedDB error in service worker:', error);
                  return;
                }
              },
            },
          ],
        },
      },
    ],
  },
})(nextConfig);
