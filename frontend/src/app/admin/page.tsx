'use client'

import { useEffect, useState, useCallback } from 'react'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
import { useAuth, useAccessToken } from '@/providers/AuthProvider'
import { apiFetch } from '@/utils/api'
import type { UserProfile, ActiveSession, UserAction } from '@/types/supabase'
import { AppHeader } from '@/components/AppHeader'
import { Users, Clock, Eye, AlertTriangle, Shield, Lock, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface AdminStats {
  totalUsers: number
  activeUsers: number
  todayLogins: number
  totalActions: number
  securityAlerts: number
  failedAttempts: number
}

interface SecurityAlert {
  type: string
  severity: 'low' | 'medium' | 'high'
  message: string
  data: { ip?: string; email?: string; count?: number }
  timestamp: string
}


export default function AdminDashboard() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { getAccessToken } = useAccessToken()
  const [stats, setStats] = useState<AdminStats>({ 
    totalUsers: 0, 
    activeUsers: 0, 
    todayLogins: 0, 
    totalActions: 0,
    securityAlerts: 0,
    failedAttempts: 0
  })
  // Active sessions UI/metric removed (GA4 later)
  const [recentActions, setRecentActions] = useState<UserAction[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'users' | 'credits'>('overview')

  // Admin users summary with credits and purchases
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
  const [summary, setSummary] = useState<AdminUserSummary[]>([])
  const [summaryTotal, setSummaryTotal] = useState(0)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summarySearch, setSummarySearch] = useState('')
  const [summaryLimit, setSummaryLimit] = useState(20)
  const [summaryOffset, setSummaryOffset] = useState(0)
  const [adjustDelta, setAdjustDelta] = useState<Record<string, number>>({})
  const [adjustNote, setAdjustNote] = useState<Record<string, string>>({})
  const [adjusting, setAdjusting] = useState<Record<string, boolean>>({})

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true)
      const overview = await apiFetch<{
        success: boolean,
        data: {
          users: UserProfile[]
          active_sessions: ActiveSession[]
          recent_actions: UserAction[]
          today_logins_count: number
          today_actions_count: number
        }
      }>('/api/admin/overview', { getAccessToken })

      // No failed attempts tracking anymore
      const alerts: SecurityAlert[] = []

      setAllUsers(overview.data.users)
      // Active sessions ignored per product decision
      setRecentActions(overview.data.recent_actions)
      setSecurityAlerts(alerts)
      setStats({
        totalUsers: overview.data.users.length,
        activeUsers: 0,
        todayLogins: overview.data.today_logins_count,
        totalActions: overview.data.today_actions_count,
        securityAlerts: alerts.length,
        failedAttempts: 0
      })

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

  // Purchases (paid accesses) state
  interface PurchaseRow {
    user_id: string
    user_full_name: string | null
    user_email: string | null
    event_id: string | null
    event_name: string | null
    granted_at: string | null
    access_type: string | null
  }
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [purchasesTotal, setPurchasesTotal] = useState(0)
  const [purchasesLoading, setPurchasesLoading] = useState(false)
  const [purchasesSearch, setPurchasesSearch] = useState('')
  const [purchasesLimit, setPurchasesLimit] = useState(20)
  const [purchasesOffset, setPurchasesOffset] = useState(0)

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
      // Refresh just this row locally
      setSummary(prev => prev.map(u => u.id === userId ? { ...u, credits: (u.credits || 0) + delta } : u))
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
    if (!authLoading && isAdmin) {
      fetchUsersSummary()
    }
  }, [authLoading, isAdmin, fetchUsersSummary])

  useEffect(() => {
    if (!authLoading && isAdmin && activeTab === 'credits') {
      fetchPurchases()
    }
  }, [authLoading, isAdmin, activeTab, fetchPurchases])

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

  // formatDuration removed (no longer used)

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader 
        title="Admin Dashboard"
        subtitle="Manage users, monitor activity, and view system statistics"
        showBackButton={true}
        backUrl="/"
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Navigation Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'security'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Security
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'credits'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Credits
            </button>
          </nav>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Today's Logins</p>
                <p className="text-2xl font-bold text-gray-900">{stats.todayLogins}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Eye className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Today's Actions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalActions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Security Alerts</p>
                <p className="text-2xl font-bold text-gray-900">{stats.securityAlerts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Lock className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Failed Attempts</p>
                <p className="text-2xl font-bold text-gray-900">{stats.failedAttempts}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                <p className="text-sm text-gray-500">Last 24 hours</p>
              </div>
              <div className="p-6">
                {recentActions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No recent activity</p>
                ) : (
                  <div className="space-y-3">
                    {recentActions.slice(0, 8).map((action) => (
                      <div key={action.id} className="flex items-start gap-3 text-sm">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900">
                            <span className="font-medium">
                              {(action as UserAction & { user_profiles?: { full_name?: string } }).user_profiles?.full_name || 'Unknown User'}
                            </span>
                            {' '}
                            <span className="text-gray-600">{action.action_type}</span>
                            {action.resource_type && (
                              <span className="text-gray-600"> on {action.resource_type}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(action.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'credits' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Käufe (bezahlte Zugriffe)</h2>
                <p className="text-sm text-gray-500">Welche Nutzer welche Events gekauft haben</p>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nutzer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event ID</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchasesLoading ? (
                    <tr><td className="px-6 py-4" colSpan={5}>Lade Daten...</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td className="px-6 py-4" colSpan={5}>Keine Käufe gefunden</td></tr>
                  ) : (
                    purchases.map((p, idx) => (
                      <tr key={`${p.user_id}-${p.event_id}-${p.granted_at}-${idx}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(p.granted_at)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.user_full_name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.user_email || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.event_name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.event_id || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex items-center justify-between text-sm text-gray-600">
              <div>
                Einträge {purchases.length > 0 ? purchasesOffset + 1 : 0}
                –{Math.min(purchasesOffset + purchasesLimit, purchasesTotal)} von {purchasesTotal}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={purchasesOffset === 0}
                  onClick={() => setPurchasesOffset(Math.max(0, purchasesOffset - purchasesLimit))}
                >Zurück</button>
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={purchasesOffset + purchasesLimit >= purchasesTotal}
                  onClick={() => setPurchasesOffset(purchasesOffset + purchasesLimit)}
                >Weiter</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Security Alerts */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Security Alerts</h2>
                <p className="text-sm text-gray-500">Suspicious activity detected</p>
              </div>
              <div className="p-6">
                {securityAlerts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No security alerts</p>
                ) : (
                  <div className="space-y-4">
                    {securityAlerts.map((alert, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertCircle className={`h-5 w-5 mt-0.5 ${
                            alert.severity === 'high' ? 'text-red-500' :
                            alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                          }`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(alert.severity)}`}>
                                {alert.severity.toUpperCase()}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatTime(alert.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-900">{alert.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'overview' && (
          <div className="mt-8 bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Credits & Purchases</h2>
                <p className="text-sm text-gray-500">Verwalte Credits und Käufe pro Benutzer</p>
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
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            u.role === 'admin' ? 'bg-red-100 text-red-800' :
                            u.role === 'commentator' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                          }`}>
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
                              placeholder="Δ"
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
                              {adjusting[u.id] ? 'Speichere…' : 'Anwenden'}
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
                Einträge {summary.length > 0 ? summaryOffset + 1 : 0}
                –{Math.min(summaryOffset + summaryLimit, summaryTotal)} von {summaryTotal}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={summaryOffset === 0}
                  onClick={() => setSummaryOffset(Math.max(0, summaryOffset - summaryLimit))}
                >Zurück</button>
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={summaryOffset + summaryLimit >= summaryTotal}
                  onClick={() => setSummaryOffset(summaryOffset + summaryLimit)}
                >Weiter</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          /* All Users Table */
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">All Users</h2>
              <p className="text-sm text-gray-500">Manage user accounts and permissions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Organization
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
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
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === 'admin' ? 'bg-red-100 text-red-800' :
                          user.role === 'commentator' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
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
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
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
      </div>
    </div>
  )
}
