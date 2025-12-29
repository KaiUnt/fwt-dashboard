import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  // Fix multiple lockfiles warning
  outputFileTracingRoot: require('path').join(__dirname, '..'),
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
  register: false,
  disable: process.env.NODE_ENV === "development",
  // Use empty fallbacks object to avoid TypeScript error
  fallbacks: {
    document: '/offline',
    image: '/offline-image.svg'
  },
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    // Disable default navigation handling
    navigateFallback: undefined,
    navigateFallbackDenylist: [/.*/],
    runtimeCaching: [
      {
        // Prefer fresh series rankings; allow long network time for heavy queries.
        urlPattern: /\/api\/series\/rankings\//,
        handler: "NetworkFirst",
        options: {
          cacheName: "series-rankings",
          networkTimeoutSeconds: 70,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60, // 1 hour
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https?.*/, // Cache all external requests
        handler: "NetworkFirst",
        options: {
          cacheName: "https-calls",
          networkTimeoutSeconds: 10,
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
        },
      },
    ],
  },
})(nextConfig);
