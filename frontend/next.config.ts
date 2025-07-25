import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  eslint: {
    // Only ignore ESLint in development or CI environments where it's handled separately
    ignoreDuringBuilds: process.env.NODE_ENV === 'development' || process.env.CI === 'true',
  },
  typescript: {
    // Only ignore TypeScript errors in development - always check in production
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
  images: {
    domains: ['liveheats.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'liveheats.com',
        pathname: '/images/**',
      },
    ],
  },
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
        urlPattern: /^http:\/\/localhost:8000\/.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-calls",
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
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
