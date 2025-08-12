'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { AppHeader } from '@/components/AppHeader'
import { Coins, Users, TrendingUp, DollarSign, Gift, AlertTriangle } from 'lucide-react'
import { useAccessToken } from '@/providers/AuthProvider'
import { apiFetch } from '@/utils/api'
import { useRouter } from 'next/navigation'

interface CreditStats {
  total_users_with_credits: number
  total_credits_in_system: number
  total_transactions: number
  completed_purchases: number
}

interface UserProfile {
  id: string
  full_name: string
  email: string
  role: string
  organization?: string
}

export default function AdminCreditsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<CreditStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [grantCreditsMode, setGrantCreditsMode] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')
  const [creditsToGrant, setCreditsToGrant] = useState(1)
  const [grantNote, setGrantNote] = useState('')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [granting, setGranting] = useState(false)
  const { getAccessToken } = useAccessToken()

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/')
    }
  }, [isAdmin, authLoading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchStats()
      fetchUsers()
    }
  }, [isAdmin])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const data = await apiFetch('/api/admin/credits/stats', { getAccessToken })
      setStats(data.stats)
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      // Fetch users via backend API endpoint (assumes backend has an admin users list endpoint)
      const data = await apiFetch('/api/admin/users', { getAccessToken })
      if (data?.users) setUsers(data.users as UserProfile[])
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const grantCredits = async () => {
    if (!selectedUser || creditsToGrant <= 0) return

    try {
      setGranting(true)
      const data = await apiFetch(`/api/admin/credits/grant/${selectedUser}`, {
        method: 'POST',
        getAccessToken,
        body: {
          credits: creditsToGrant,
          note: grantNote || 'Admin grant'
        }
      })
      alert(`Credits successfully granted: ${data.message}`)
        
      // Reset form
      setSelectedUser('')
      setCreditsToGrant(1)
      setGrantNote('')
      setGrantCreditsMode(false)
      
      // Refresh stats
      fetchStats()
    } catch (err) {
      console.error('Error granting credits:', err)
      alert('Failed to grant credits')
    } finally {
      setGranting(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <AppHeader 
        title="Credits System Admin"
        subtitle="Verwalte das Credits-System"
        showBackButton={true}
        backUrl="/admin"
      >
        <button
          onClick={() => setGrantCreditsMode(!grantCreditsMode)}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
        >
          <Gift className="h-4 w-4" />
          <span>Credits vergeben</span>
        </button>
      </AppHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Benutzer mit Credits</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.total_users_with_credits}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Coins className="h-8 w-8 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Credits im System</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.total_credits_in_system}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Transaktionen</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.total_transactions}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Käufe abgeschlossen</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.completed_purchases}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grant Credits Form */}
        {grantCreditsMode && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Credits an Benutzer vergeben</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Benutzer auswählen
                </label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Benutzer wählen --</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email} ({user.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Anzahl Credits
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={creditsToGrant}
                  onChange={(e) => setCreditsToGrant(parseInt(e.target.value) || 1)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notiz (optional)
                </label>
                <input
                  type="text"
                  placeholder="Grund für die Vergabe..."
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2 flex space-x-3">
                <button
                  onClick={grantCredits}
                  disabled={!selectedUser || creditsToGrant <= 0 || granting}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  {granting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Vergebe Credits...</span>
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4" />
                      <span>Credits vergeben</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setGrantCreditsMode(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* System Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900">Preismodell</h4>
              <ul className="text-sm text-gray-600 mt-1 space-y-1">
                <li>• 1 Event: 10€ (1 Credit)</li>
                <li>• 5 Events: 40€ (5 Credits)</li>
                <li>• 10 Events: 70€ (10 Credits) - Bester Wert</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900">Automatische Regeln</h4>
              <ul className="text-sm text-gray-600 mt-1 space-y-1">
                <li>• Neue Benutzer erhalten automatisch 2 kostenlose Credits</li>
                <li>• Events werden 7 Tage nach Ende automatisch kostenlos</li>
                <li>• Credits verfallen nicht</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-900">Nächste Schritte</h4>
              <ul className="text-sm text-gray-600 mt-1 space-y-1">
                <li>• Phase 2: Stripe-Integration für Zahlungen</li>
                <li>• Phase 2: EU-konforme Rechnungsstellung</li>
                <li>• Phase 2: Refund-System</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}