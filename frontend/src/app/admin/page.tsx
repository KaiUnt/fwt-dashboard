'use client'

import { useEffect, useState, useCallback } from 'react'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
import { useAuth, useAccessToken } from '@/providers/AuthProvider'
import { apiFetch } from '@/utils/api'
import type { UserProfile, ActiveSession, UserAction } from '@/types/supabase'
import { AppHeader } from '@/components/AppHeader'
import { Users, Activity, Clock, Eye, AlertTriangle, Shield, Lock, AlertCircle } from 'lucide-react'
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
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])
  const [recentActions, setRecentActions] = useState<UserAction[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'users'>('overview')

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
      setActiveSessions(overview.data.active_sessions)
      setRecentActions(overview.data.recent_actions)
      setSecurityAlerts(alerts)
      setStats({
        totalUsers: overview.data.users.length,
        activeUsers: overview.data.active_sessions.length,
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

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      return
    }

    fetchAdminData()
  }, [isAdmin, authLoading, fetchAdminData])

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

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A'
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

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
          </nav>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
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
              <Activity className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Now</p>
                <p className="text-2xl font-bold text-gray-900">{stats.activeUsers}</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Active Sessions */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Active Sessions</h2>
                <p className="text-sm text-gray-500">Users currently online</p>
              </div>
              <div className="p-6">
                {activeSessions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No active sessions</p>
                ) : (
                  <div className="space-y-4">
                    {activeSessions.slice(0, 5).map((session, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {session.full_name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{session.full_name}</p>
                            <p className="text-xs text-gray-500">{session.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Online for</p>
                          <p className="text-sm font-medium text-gray-900">
                            {formatDuration(session.session_minutes)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

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
