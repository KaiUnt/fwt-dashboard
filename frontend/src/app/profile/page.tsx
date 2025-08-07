'use client'

import { useState, useEffect } from 'react'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
import { useAuth } from '@/providers/AuthProvider'
import { createClient } from '@/lib/supabase'
import { AppHeader } from '@/components/AppHeader'
import { User, Mail, Shield, Building, Calendar, Key, Save, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/hooks/useTranslation'

export default function ProfilePage() {
  const { user, profile, refreshProfile, loading: authLoading } = useAuth()
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  
  // Profile form state
  const [fullName, setFullName] = useState('')
  const [organization, setOrganization] = useState('')
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setOrganization(profile.organization || '')
    }
  }, [profile])

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: fullName,
          organization: organization,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      await refreshProfile()
      setMessage(t('profile.messages.profileUpdated'))
      
      setTimeout(() => setMessage(''), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.messages.anErrorOccurred'))
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentPassword) {
      setError(t('profile.messages.currentPasswordRequired'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('profile.messages.passwordsDoNotMatch'))
      return
    }

    if (newPassword.length < 6) {
      setError(t('profile.messages.passwordTooShort'))
      return
    }

    if (currentPassword === newPassword) {
      setError(t('profile.messages.passwordSameAsCurrent'))
      return
    }

    setChangingPassword(true)
    setError('')
    setMessage('')

    try {
      // First, verify the current password by attempting to sign in
      if (!user?.email) {
        throw new Error(t('profile.messages.userEmailNotFound'))
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      })

      if (signInError) {
        throw new Error(t('profile.messages.currentPasswordIncorrect'))
      }

      // If current password is correct, update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) throw updateError

      setMessage(t('profile.messages.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      
      setTimeout(() => setMessage(''), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.messages.anErrorOccurred'))
    } finally {
      setChangingPassword(false)
    }
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return t('profile.roles.administrator')
      case 'commentator': return t('profile.roles.commentator')
      case 'viewer': return t('profile.roles.viewer')
      default: return role
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800'
      case 'commentator': return 'bg-blue-100 text-blue-800'
      case 'viewer': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('profile.accessDenied')}</h1>
        <p className="text-gray-600">{t('profile.pleaseLogin')}</p>
        <Link href="/login" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
          {t('profile.goToLogin')}
        </Link>
      </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader 
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        showBackButton={true}
        backUrl="/"
      />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Messages */}
        {message && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            <span className="text-green-700">{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Overview */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  {profile.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {profile.full_name || t('profile.unnamedUser')}
                </h2>
                <p className="text-gray-500 mb-4">{user.email}</p>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(profile.role)}`}>
                      <Shield className="h-4 w-4" />
                      {getRoleDisplayName(profile.role)}
                    </span>
                  </div>
                  
                  {profile.organization && (
                    <div className="flex items-center justify-center text-sm text-gray-500">
                      <Building className="h-4 w-4 mr-1" />
                      {profile.organization}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-center text-sm text-gray-500">
                    <Calendar className="h-4 w-4 mr-1" />
                    {t('profile.memberSince')} {profile.created_at ? new Date(profile.created_at).toLocaleDateString('de-DE') : t('profile.unknown')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Settings & Password Change */}
          <div className="lg:col-span-2 space-y-8">
            {/* Profile Information */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{t('profile.profileInformation')}</h3>
                <p className="text-sm text-gray-500">{t('profile.updatePersonalInfo')}</p>
              </div>
              
              <form onSubmit={handleProfileUpdate} className="p-6 space-y-4">
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.fullName')}
                  </label>
                  <div className="relative">
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-950"
                      placeholder={t('profile.enterFullName')}
                    />
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.emailAddress')}
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={user.email || ''}
                      disabled
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                    />
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t('profile.emailCannotBeChanged')}</p>
                </div>

                <div>
                  <label htmlFor="organization" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.organization')}
                  </label>
                  <div className="relative">
                    <input
                      id="organization"
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-950"
                      placeholder={t('profile.enterOrganization')}
                    />
                    <Building className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {t('profile.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {t('profile.saveChanges')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Password Change */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{t('profile.changePassword')}</h3>
                <p className="text-sm text-gray-500">{t('profile.updatePasswordSecure')}</p>
              </div>
              
              <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.currentPassword')}
                  </label>
                  <div className="relative">
                    <input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-950"
                      placeholder={t('profile.enterCurrentPassword')}
                      required
                    />
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.newPassword')}
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-950"
                      placeholder={t('profile.enterNewPassword')}
                      required
                    />
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.confirmNewPassword')}
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-950"
                      placeholder={t('profile.confirmNewPasswordPlaceholder')}
                      required
                    />
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {changingPassword ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {t('profile.changing')}
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        {t('profile.changePasswordButton')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}