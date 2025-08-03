'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { createClient } from '@/lib/supabase'
import { Activity, Clock, Eye, User, Calendar, Filter, RefreshCw } from 'lucide-react'
import type { UserAction, UserLoginActivity } from '@/types/supabase'

interface ActivityStats {
  totalActions: number
  todayActions: number
  totalSessions: number
  lastLogin: string | null
}

export default function ActivityPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<ActivityStats>({ totalActions: 0, todayActions: 0, totalSessions: 0, lastLogin: null })
  const [actions, setActions] = useState<UserAction[]>([])
  const [loginActivity, setLoginActivity] = useState<UserLoginActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // 'all', 'today', 'week'

  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && user) {
      fetchActivityData()
    }
  }, [user, authLoading, filter])

  const fetchActivityData = async () => {
    if (!user) return

    try {
      setLoading(true)

      // Date filters
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      let actionFilter = ''
      if (filter === 'today') {
        actionFilter = today.toISOString()
      } else if (filter === 'week') {
        actionFilter = weekAgo.toISOString()
      }

      // Fetch user actions
      let actionsQuery = supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(50)

      if (actionFilter) {
        actionsQuery = actionsQuery.gte('timestamp', actionFilter)
      }

      const { data: actionsData, error: actionsError } = await actionsQuery

      if (actionsError) throw actionsError

      // Fetch login activity
      const { data: loginData, error: loginError } = await supabase
        .from('user_login_activity')
        .select('*')
        .eq('user_id', user.id)
        .order('login_timestamp', { ascending: false })
        .limit(20)

      if (loginError) throw loginError

      // Calculate stats
      const totalActions = actionsData?.length || 0
      const todayActions = actionsData?.filter(action => 
        new Date(action.timestamp) >= today
      ).length || 0

      const lastLogin = loginData?.[0]?.login_timestamp || null

      setActions(actionsData || [])
      setLoginActivity(loginData || [])
      setStats({
        totalActions: filter === 'all' ? totalActions : actionsData?.length || 0,
        todayActions,
        totalSessions: loginData?.length || 0,
        lastLogin
      })

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diff = now.getTime() - time.getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 60) {
      return `${minutes} min ago`
    } else if (hours < 24) {
      return `${hours}h ago`
    } else if (days < 7) {
      return `${days}d ago`
    } else {
      return formatTime(timestamp)
    }
  }

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'page_view':
        return <Eye className="h-4 w-4" />
      case 'login':
        return <User className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'page_view':
        return 'text-blue-600 bg-blue-50'
      case 'login':
        return 'text-green-600 bg-green-50'
      case 'edit':
        return 'text-orange-600 bg-orange-50'
      case 'delete':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Login Required</h1>
          <p className="text-gray-600">Please log in to view your activity.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">My Activity</h1>
                <p className="text-gray-600">Track your dashboard usage and sessions</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Filter */}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
              </select>
              
              {/* Refresh */}
              <button
                onClick={fetchActivityData}
                className="p-2 text-gray-400 hover:text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Error loading activity: {error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Actions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalActions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Today's Actions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.todayActions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <User className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalSessions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Last Login</p>
                <p className="text-lg font-bold text-gray-900">
                  {stats.lastLogin ? formatRelativeTime(stats.lastLogin) : 'Never'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Actions */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Actions</h2>
              <p className="text-sm text-gray-500">Your latest dashboard activity</p>
            </div>
            <div className="p-6">
              {actions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No actions found</p>
              ) : (
                <div className="space-y-4">
                  {actions.map((action) => (
                    <div key={action.id} className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getActionColor(action.action_type)}`}>
                        {getActionIcon(action.action_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {action.action_type.replace('_', ' ')}
                          {action.resource_type && (
                            <span className="text-gray-600"> • {action.resource_type}</span>
                          )}
                        </p>
                        {action.resource_id && (
                          <p className="text-xs text-gray-500 truncate">
                            {action.resource_id}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          {formatRelativeTime(action.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Login Sessions */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Login Sessions</h2>
              <p className="text-sm text-gray-500">Your recent login activity</p>
            </div>
            <div className="p-6">
              {loginActivity.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No login sessions found</p>
              ) : (
                <div className="space-y-4">
                  {loginActivity.map((session) => (
                    <div key={session.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {session.login_method} Login
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(session.login_timestamp)}
                          </p>
                          {session.ip_address && (
                            <p className="text-xs text-gray-400">
                              {session.ip_address}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {session.logout_timestamp ? (
                          <div>
                            <p className="text-xs text-gray-500">Ended</p>
                            <p className="text-xs text-gray-400">
                              {formatRelativeTime(session.logout_timestamp)}
                            </p>
                          </div>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}