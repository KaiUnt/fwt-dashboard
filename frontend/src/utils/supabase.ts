/**
 * Check if Supabase is properly configured
 * 
 * Performs comprehensive validation of Supabase environment variables
 */
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Basic existence check
  if (!supabaseUrl || !supabaseKey) {
    return false
  }
  
  // Placeholder value check
  if (supabaseUrl === 'your-project-id.supabase.co' || 
      supabaseKey === 'your-anon-key-here') {
    return false
  }
  
  // Format validation
  if (!supabaseUrl.startsWith('https://') || 
      !supabaseUrl.includes('.supabase.co')) {
    return false
  }
  
  // JWT format validation for anon key
  if (!supabaseKey.startsWith('eyJ')) {
    return false
  }
  
  return true
}

/**
 * Get detailed Supabase configuration status
 * 
 * Useful for debugging and error reporting
 */
export function getSupabaseConfigStatus(): {
  isConfigured: boolean
  errors: string[]
  warnings: string[]
} {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const errors: string[] = []
  const warnings: string[] = []
  
  // URL validation
  if (!supabaseUrl) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is not set')
  } else if (supabaseUrl === 'your-project-id.supabase.co') {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is set to placeholder value')
  } else if (!supabaseUrl.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must start with https://')
  } else if (!supabaseUrl.includes('.supabase.co')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL')
  } else if (supabaseUrl.includes('localhost')) {
    warnings.push('Using localhost Supabase URL - ensure this is intended')
  }
  
  // Key validation
  if (!supabaseKey) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  } else if (supabaseKey === 'your-anon-key-here') {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is set to placeholder value')
  } else if (!supabaseKey.startsWith('eyJ')) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY must be a valid JWT token')
  } else if (supabaseKey.length < 100) {
    warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY seems unusually short')
  }
  
  return {
    isConfigured: errors.length === 0,
    errors,
    warnings
  }
}

// NOTE: getSupabaseClient is deprecated. Use AuthProvider + useAccessToken() and apiFetch instead.
