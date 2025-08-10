'use client'

import { useState, useEffect } from 'react'
import { isSupabaseConfigured } from '@/utils/supabase'

export default function TestCreditsPage() {
  const [supabaseStatus, setSupabaseStatus] = useState<string>('Checking...')
  const [creditsStatus, setCreditsStatus] = useState<string>('Not tested')
  const [apiStatus, setApiStatus] = useState<string>('Not tested')

  useEffect(() => {
    // Check Supabase configuration
    const checkSupabase = () => {
      try {
        const isConfigured = isSupabaseConfigured()
        setSupabaseStatus(isConfigured ? '✅ Configured' : '❌ Not configured')
      } catch (error) {
        setSupabaseStatus(`❌ Error: ${error}`)
      }
    }

    // Test credits API
    const testCreditsAPI = async () => {
      try {
        setCreditsStatus('Testing...')
        const response = await fetch('/api/credits/balance')
        if (response.ok) {
          setCreditsStatus('✅ API endpoint working')
        } else {
          const error = await response.text()
          setCreditsStatus(`❌ API error: ${response.status} - ${error}`)
        }
      } catch (error) {
        setCreditsStatus(`❌ Network error: ${error}`)
      }
    }

    // Test backend API
    const testBackendAPI = async () => {
      try {
        setApiStatus('Testing...')
        const response = await fetch('http://localhost:8000/api/credits/balance')
        if (response.ok) {
          setApiStatus('✅ Backend API working')
        } else {
          const error = await response.text()
          setApiStatus(`❌ Backend error: ${response.status} - ${error}`)
        }
      } catch (error) {
        setApiStatus(`❌ Backend network error: ${error}`)
      }
    }

    checkSupabase()
    testCreditsAPI()
    testBackendAPI()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Credits Integration Test</h1>
        
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Configuration Status</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Supabase Configuration:</span>
                <span className="font-mono">{supabaseStatus}</span>
              </div>
              <div className="flex justify-between">
                <span>Frontend API Route:</span>
                <span className="font-mono">{creditsStatus}</span>
              </div>
              <div className="flex justify-between">
                <span>Backend API:</span>
                <span className="font-mono">{apiStatus}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Environment Variables</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>NEXT_PUBLIC_SUPABASE_URL:</span>
                <span className="font-mono text-sm">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL ? 
                    `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 20)}...` : 
                    'Not set'
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span>NEXT_PUBLIC_SUPABASE_ANON_KEY:</span>
                <span className="font-mono text-sm">
                  {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 
                    `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...` : 
                    'Not set'
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Next Steps</h2>
            <div className="space-y-2 text-sm">
              <p>1. Ensure Supabase is configured with valid credentials</p>
              <p>2. Run the credits schema migration in your Supabase database</p>
              <p>3. Test the credits functionality with a logged-in user</p>
              <p>4. Check the browser console for any errors</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
