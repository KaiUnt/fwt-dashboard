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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://liveheats.com; connect-src 'self' https://liveheats.com http://localhost:8000;",
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
        },
      },
      {
        // Only cache localhost API in development
        urlPattern: ({ url }) => {
          return process.env.NODE_ENV === 'development' && url.origin === 'http://localhost:8000';
        },
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
        },
      },
      {
        urlPattern: ({ url }) => {
          const currentYear = new Date().getFullYear();
          const lastYear = currentYear - 1;
          return url.pathname.includes('/api/series-rankings') && 
                 (url.searchParams.get('year') === currentYear.toString() || 
                  url.searchParams.get('year') === lastYear.toString());
        },
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
        },
      },
      {
        urlPattern: ({ url }) => {
          return url.pathname.includes('/api/athlete/') && url.pathname.includes('/event-history/');
        },
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
        },
      },
      {
        urlPattern: ({ url }) => {
          // Cache translation files specifically for offline support
          return url.pathname.includes('/locales/') && url.pathname.endsWith('.json');
        },
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
        },
      },
      {
        urlPattern: ({ url }) => {
          // Cache other JSON files but exclude translation files (handled above)
          return url.pathname.endsWith('.json') && !url.pathname.includes('/locales/');
        },
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-resources",
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
})(nextConfig);
