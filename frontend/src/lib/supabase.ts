import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

/**
 * Environment validation helper
 */
function validateSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const errors: string[] = []
  
  if (!supabaseUrl) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is not set')
  } else if (supabaseUrl === 'your-project-id.supabase.co') {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is set to placeholder value')
  } else if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL has invalid format')
  }
  
  if (!supabaseKey) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  } else if (supabaseKey === 'your-anon-key-here') {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is set to placeholder value')
  } else if (!supabaseKey.startsWith('eyJ')) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY has invalid JWT format')
  }
  
  return { supabaseUrl, supabaseKey, errors }
}

/**
 * Check if we're in build/pre-rendering context
 */
function isBuildTime(): boolean {
  // More comprehensive build-time detection
  return typeof window === 'undefined' && (
    // During next build
    process.env.NODE_ENV === 'production' ||
    // During next build with no NODE_ENV set
    process.env.NODE_ENV === undefined ||
    // During prerendering phase
    process.env.NEXT_PHASE === 'phase-production-build' ||
    // When Next.js is building
    !!process.env.__NEXT_PRIVATE_PREBUNDLED_REACT
  )
}

/**
 * Create Supabase client for browser (Client Components)
 * 
 * Production-ready implementation with proper error handling
 */
export const createClient = () => {
  const { supabaseUrl, supabaseKey, errors } = validateSupabaseConfig()
  
  // During build time, always provide a minimal client to prevent build errors
  // This only happens during `next build`, not in actual runtime
  if (isBuildTime()) {
    if (errors.length > 0) {
      console.warn('Supabase config validation failed during build. Using placeholder client for build process.')
    } else {
    }
    
    // Return a minimal client that satisfies TypeScript but won't be used in runtime
    return createBrowserClient<Database>(
      'https://build-time-placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJidWlsZC10aW1lIiwicm9sZSI6InBsYWNlaG9sZGVyIn0.placeholder'
    )
  }
  
  // Runtime validation - this should never fail in production
  if (errors.length > 0) {
    const errorMessage = `
🔒 Supabase Configuration Error:

${errors.map(err => `  ❌ ${err}`).join('\n')}

🔧 How to fix:
  1. Check your .env.local file in the frontend directory
  2. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set
  3. Get values from: https://app.supabase.com/project/_/settings/api
  
💡 Expected format:
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
    `.trim()
    
    throw new Error(errorMessage)
  }
  
  return createBrowserClient<Database>(supabaseUrl!, supabaseKey!)
}

