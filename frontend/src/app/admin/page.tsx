'use client'

import { useEffect, useState, useCallback } from 'react'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
import { useAuth, useAccessToken } from '@/providers/AuthProvider'
import { apiFetch } from '@/utils/api'
import type { UserProfile } from '@/types/supabase'
import { AppHeader } from '@/components/AppHeader'
import { Users, Clock, ShoppingCart, CreditCard, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

type Section = 'users' | 'logins' | 'purchases' | 'credits'

interface AdminStats {
  totalUsers: number
  todayLogins: number
}

interface AdminUserSummary {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  organization?: string | null
  is_active?: boolean | null
  created_at?: string | null
  credits: number
  purchased_events_count: number
}

interface PurchaseRow {
  user_id: string
  user_full_name: string | null
  user_email: string | null
  event_id: string | null
  event_name: string | null
  granted_at: string | null
  access_type: string | null
}

export default function AdminDashboard() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { getAccessToken } = useAccessToken()

  const [activeSection, setActiveSection] = useState<Section>('users')
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    todayLogins: 0,
  })
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [summary, setSummary] = useState<AdminUserSummary[]>([])
  const [summaryTotal, setSummaryTotal] = useState(0)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summarySearch, setSummarySearch] = useState('')
  const [summaryLimit, setSummaryLimit] = useState(20)
  const [summaryOffset, setSummaryOffset] = useState(0)
  const [adjustDelta, setAdjustDelta] = useState<Record<string, number>>({})
  const [adjustNote, setAdjustNote] = useState<Record<string, string>>({})
  const [adjusting, setAdjusting] = useState<Record<string, boolean>>({})

  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [purchasesTotal, setPurchasesTotal] = useState<number | null>(null)
  const [purchasesLoading, setPurchasesLoading] = useState(false)
  const [purchasesSearch, setPurchasesSearch] = useState('')
  const [purchasesLimit, setPurchasesLimit] = useState(20)
  const [purchasesOffset, setPurchasesOffset] = useState(0)

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true)
      const overview = await apiFetch<{
        success: boolean
        data: {
          users: UserProfile[]
          today_logins_count: number
        }
      }>('/api/admin/overview', { getAccessToken })

      setAllUsers(overview.data.users)
      setStats({
        totalUsers: overview.data.users.length,
        todayLogins: overview.data.today_logins_count,
      })
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  const fetchUsersSummary = useCallback(async () => {
    if (!isAdmin) return
    try {
      setSummaryLoading(true)
      const params = new URLSearchParams()
      if (summarySearch) params.set('search', summarySearch)
      params.set('limit', String(summaryLimit))
      params.set('offset', String(summaryOffset))
      const data = await apiFetch<{ success: boolean; users: AdminUserSummary[]; total: number }>(
        `/api/admin/users/summary?${params.toString()}`,
        { getAccessToken }
      )
      setSummary(data.users)
      setSummaryTotal(data.total)
    } catch (e) {
      console.error('Failed to load users summary', e)
    } finally {
      setSummaryLoading(false)
    }
  }, [getAccessToken, isAdmin, summaryLimit, summaryOffset, summarySearch])

  const fetchPurchases = useCallback(async () => {
    if (!isAdmin) return
    try {
      setPurchasesLoading(true)
      const params = new URLSearchParams()
      if (purchasesSearch) params.set('search', purchasesSearch)
      params.set('limit', String(purchasesLimit))
      params.set('offset', String(purchasesOffset))
      const data = await apiFetch<{ success: boolean; purchases: PurchaseRow[]; total: number }>(
        `/api/admin/credits/purchases?${params.toString()}`,
        { getAccessToken }
      )
      setPurchases(data.purchases)
      setPurchasesTotal(data.total)
    } catch (e) {
      console.error('Failed to load purchases', e)
    } finally {
      setPurchasesLoading(false)
    }
  }, [getAccessToken, isAdmin, purchasesLimit, purchasesOffset, purchasesSearch])

  const applyAdjust = useCallback(async (userId: string) => {
    const delta = adjustDelta[userId]
    const note = adjustNote[userId]
    if (!delta || delta === 0) return
    try {
      setAdjusting(prev => ({ ...prev, [userId]: true }))
      await apiFetch<{ success: boolean; credits_total: number }>(
        `/api/admin/credits/adjust/${userId}`,
        {
          method: 'POST',
          getAccessToken,
          body: { delta, note },
        }
      )
      setSummary(prev => prev.map(u => (u.id === userId ? { ...u, credits: (u.credits || 0) + delta } : u)))
      setAdjustDelta(prev => ({ ...prev, [userId]: 0 }))
      setAdjustNote(prev => ({ ...prev, [userId]: '' }))
    } catch (e) {
      console.error('Failed to adjust credits', e)
      alert('Fehler beim Anpassen der Credits')
    } finally {
      setAdjusting(prev => ({ ...prev, [userId]: false }))
    }
  }, [adjustDelta, adjustNote, getAccessToken])

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      return
    }

    fetchAdminData()
  }, [isAdmin, authLoading, fetchAdminData])

  useEffect(() => {
    if (authLoading || !isAdmin || activeSection !== 'credits') {
      return
    }

    fetchUsersSummary()
  }, [authLoading, isAdmin, activeSection, fetchUsersSummary])

  useEffect(() => {
    if (authLoading || !isAdmin || activeSection !== 'purchases') {
      return
    }

    fetchPurchases()
  }, [authLoading, isAdmin, activeSection, fetchPurchases])

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const summaryCreditsTotal = summary.reduce((acc, user) => acc + (typeof user.credits === 'number' ? user.credits : 0), 0)
  const summaryCreditsDisplay = summary.length > 0 ? summaryCreditsTotal.toLocaleString('de-DE') : '--'
  const purchasesDisplay = purchasesTotal !== null ? purchasesTotal.toLocaleString('de-DE') : '--'

  const cards: Array<{
    key: Section
    label: string
    value: string
    hint: string
    icon: typeof Users
  }> = [
    {
      key: 'users',
      label: 'Total Users',
      value: stats.totalUsers.toLocaleString('de-DE'),
      hint: 'Alle registrierten Nutzer',
      icon: Users,
    },
    {
      key: 'logins',
      label: "Today's Logins",
      value: stats.todayLogins.toLocaleString('de-DE'),
      hint: 'Login-Details folgen',
      icon: Clock,
    },
    {
      key: 'purchases',
      label: 'Event Purchases',
      value: purchasesDisplay,
      hint: 'Gekaufte Events anzeigen',
      icon: ShoppingCart,
    },
    {
      key: 'credits',
      label: 'Credits Total',
      value: summaryCreditsDisplay,
      hint: 'Credits vergeben oder abziehen',
      icon: CreditCard,
    },
  ]

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading admin data: {error}</p>
          <button
            onClick={fetchAdminData}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const totalPurchasesCount = purchasesTotal ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title="Admin Dashboard"
        subtitle="Manage users, monitor activity, and view system statistics"
        showBackButton={true}
        backUrl="/"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {cards.map((card) => {
            const Icon = card.icon
            const isActive = activeSection === card.key
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveSection(card.key)}
                className={`bg-white rounded-lg shadow p-6 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isActive ? 'ring-2 ring-blue-500 ring-offset-0' : 'hover:shadow-md'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
                    <p className="mt-1 text-xs text-gray-500">{card.hint}</p>
                  </div>
                  <Icon className="h-8 w-8 text-blue-600" />
                </div>
              </button>
            )
          })}
        </div>

        {activeSection === 'users' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">All Users</h2>
              <p className="text-sm text-gray-500">Manage user accounts and permissions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.role === 'admin'
                              ? 'bg-red-100 text-red-800'
                              : user.role === 'commentator'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.organization || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTime(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === 'logins' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Today's Logins</h2>
              <p className="text-sm text-gray-500">Detailansicht folgt bald.</p>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-600">
              <p>Erfasste Logins heute: <span className="font-semibold text-gray-900">{stats.todayLogins.toLocaleString('de-DE')}</span></p>
              <p>Eine eigene Ansicht wird bald Logins mit Zeitstempel auflisten.</p>
            </div>
          </div>
        )}

        {activeSection === 'purchases' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Event Purchases</h2>
                <p className="text-sm text-gray-500">See which users bought access to which events.</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Suche Nutzer/Email/Event"
                  value={purchasesSearch}
                  onChange={(e) => { setPurchasesOffset(0); setPurchasesSearch(e.target.value) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={fetchPurchases}
                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
                >Suchen</button>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Pro Seite</label>
                  <select
                    value={purchasesLimit}
                    onChange={(e) => { const v = parseInt(e.target.value, 10) || 20; setPurchasesLimit(v); setPurchasesOffset(0); fetchPurchases() }}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Granted At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchasesLoading ? (
                    <tr><td className="px-6 py-4" colSpan={4}>Lade...</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td className="px-6 py-4" colSpan={4}>Keine Kaeufe gefunden</td></tr>
                  ) : (
                    purchases.map((purchase, index) => (
                      <tr key={`${purchase.user_id}-${purchase.event_id}-${index}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{purchase.user_full_name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{purchase.user_email || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{purchase.event_name || purchase.event_id || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatTime(purchase.granted_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex items-center justify-between text-sm text-gray-600">
              <div>
                Eintraege {purchases.length > 0 ? purchasesOffset + 1 : 0} - {Math.min(purchasesOffset + purchasesLimit, totalPurchasesCount)} von {totalPurchasesCount}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={purchasesOffset === 0}
                  onClick={() => setPurchasesOffset(Math.max(0, purchasesOffset - purchasesLimit))}
                >Zurueck</button>
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={purchasesOffset + purchasesLimit >= totalPurchasesCount}
                  onClick={() => setPurchasesOffset(purchasesOffset + purchasesLimit)}
                >Weiter</button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'credits' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Credits Management</h2>
                <p className="text-sm text-gray-500">Search users and adjust their credit balance.</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Suche Name oder E-Mail"
                  value={summarySearch}
                  onChange={(e) => { setSummaryOffset(0); setSummarySearch(e.target.value) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={fetchUsersSummary}
                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
                >Suchen</button>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Pro Seite</label>
                  <select
                    value={summaryLimit}
                    onChange={(e) => { const v = parseInt(e.target.value, 10) || 20; setSummaryLimit(v); setSummaryOffset(0); }}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Purchased</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adjust</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {summaryLoading ? (
                    <tr><td className="px-6 py-4" colSpan={6}>Lade Daten...</td></tr>
                  ) : summary.length === 0 ? (
                    <tr><td className="px-6 py-4" colSpan={6}>Keine Benutzer gefunden</td></tr>
                  ) : (
                    summary.map(u => (
                      <tr key={u.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{u.full_name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.email || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              u.role === 'admin'
                                ? 'bg-red-100 text-red-800'
                                : u.role === 'commentator'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{u.credits}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{u.purchased_events_count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                              placeholder="0"
                              value={adjustDelta[u.id] ?? 0}
                              onChange={(e) => setAdjustDelta(prev => ({ ...prev, [u.id]: parseInt(e.target.value || '0', 10) }))}
                            />
                            <input
                              type="text"
                              className="w-48 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                              placeholder="Notiz (optional)"
                              value={adjustNote[u.id] ?? ''}
                              onChange={(e) => setAdjustNote(prev => ({ ...prev, [u.id]: e.target.value }))}
                            />
                            <button
                              onClick={() => applyAdjust(u.id)}
                              disabled={!!adjusting[u.id] || !((adjustDelta[u.id] ?? 0) !== 0)}
                              className={`px-3 py-1.5 rounded-lg text-sm text-white ${adjusting[u.id] ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                              {adjusting[u.id] ? 'Speichere...' : 'Anwenden'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex items-center justify-between text-sm text-gray-600">
              <div>
                Eintraege {summary.length > 0 ? summaryOffset + 1 : 0} - {Math.min(summaryOffset + summaryLimit, summaryTotal)} von {summaryTotal}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={summaryOffset === 0}
                  onClick={() => setSummaryOffset(Math.max(0, summaryOffset - summaryLimit))}
                >Zurueck</button>
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={summaryOffset + summaryLimit >= summaryTotal}
                  onClick={() => setSummaryOffset(summaryOffset + summaryLimit)}
                >Weiter</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}




