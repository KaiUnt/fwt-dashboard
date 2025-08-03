'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Menu, X } from 'lucide-react'
import { UserNav } from './UserNav'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useTranslation } from '@/hooks/useTranslation'

interface AppHeaderProps {
  title: string
  subtitle?: string
  showBackButton?: boolean
  backUrl?: string
  children?: React.ReactNode // For action buttons like OfflineSaveButton, etc.
}

export function AppHeader({ 
  title, 
  subtitle, 
  showBackButton = true, 
  backUrl = '/',
  children 
}: AppHeaderProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleBack = () => {
    if (backUrl) {
      router.push(backUrl)
    } else {
      router.back()
    }
  }

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Back button and title */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            {showBackButton && (
              <button
                onClick={handleBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors p-2 -ml-2 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="hidden sm:block">{t('buttons.back')}</span>
              </button>
            )}
            
            {showBackButton && <div className="h-6 w-px bg-gray-300" />}
            
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-gray-600 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right side - Desktop navigation and actions */}
          <div className="hidden md:flex items-center space-x-3">
            {children}
            <div className="h-6 w-px bg-gray-300" />
            <LanguageSwitcher />
            <UserNav />
          </div>

          {/* Mobile burger menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4 space-y-4">
            {/* Action buttons in mobile */}
            {children && (
              <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                {children}
              </div>
            )}
            
            {/* Language and User controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-gray-700">{t('header.language')}</span>
                <LanguageSwitcher />
              </div>
            </div>
            
            {/* User navigation in mobile */}
            <div className="pt-2">
              <UserNav />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}