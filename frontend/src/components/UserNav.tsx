'use client'

import { useState } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { User, LogOut, Settings, Shield, Activity, ChevronDown } from 'lucide-react'
import Link from 'next/link'

export function UserNav() {
  const { user, profile, signOut, isAdmin, loading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (loading) {
    return (
      <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
    )
  }

  if (!user || !profile) {
    return null
  }

  const handleSignOut = async () => {
    await signOut()
    setIsOpen(false)
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800'
      case 'commentator':
        return 'bg-blue-100 text-blue-800'
      case 'viewer':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-3 w-3" />
      case 'commentator':
        return <User className="h-3 w-3" />
      case 'viewer':
        return <User className="h-3 w-3" />
      default:
        return <User className="h-3 w-3" />
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
            {profile.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="hidden sm:block">
            {profile.full_name || user.email}
          </span>
        </div>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            {/* User Info */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                  {profile.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {profile.full_name || 'Unnamed User'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user.email}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(profile.role)}`}>
                      {getRoleIcon(profile.role)}
                      {profile.role}
                    </span>
                    {profile.organization && (
                      <span className="text-xs text-gray-500">
                        • {profile.organization}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              <Link
                href="/profile"
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setIsOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Profile Settings
              </Link>

              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setIsOpen(false)}
                >
                  <Shield className="h-4 w-4" />
                  Admin Dashboard
                </Link>
              )}

              <Link
                href="/activity"
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setIsOpen(false)}
              >
                <Activity className="h-4 w-4" />
                My Activity
              </Link>
            </div>

            {/* Sign Out */}
            <div className="border-t border-gray-100 py-2">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-2 text-sm text-red-700 hover:bg-red-50 w-full text-left"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}