'use client'

import { useEffect } from 'react'
import { X, Coins, Mail } from 'lucide-react'
import { isSupabaseConfigured } from '@/utils/supabase'
import { useTranslation } from '@/providers/TranslationProvider'

interface CreditsModalProps {
  isOpen: boolean
  onClose: () => void
  currentCredits: number
  onCreditsUpdate: (credits: number) => void
}

export default function CreditsModal({
  isOpen,
  onClose,
  currentCredits,
  onCreditsUpdate
}: CreditsModalProps) {
  const { t } = useTranslation()

  // Update parent component when credits change
  useEffect(() => {
    if (isOpen) {
      onCreditsUpdate(currentCredits)
    }
  }, [currentCredits, isOpen, onCreditsUpdate])

  if (!isOpen) return null

  // Check if Supabase is configured
  if (!isSupabaseConfigured()) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Coins className="h-6 w-6 text-yellow-600" />
              <h2 className="text-xl font-bold text-gray-900">{t('credits.modal.title')}</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="text-center">
            <p className="text-gray-700 mb-4">
              {t('credits.modal.notConfigured')}
            </p>
            <p className="text-sm text-gray-600">
              {t('credits.modal.contactAdmin')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Coins className="h-6 w-6 text-yellow-600" />
            <h2 className="text-xl font-bold text-gray-900">{t('credits.modal.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Current Balance */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Coins className="h-8 w-8 text-yellow-600" />
                <span className="text-3xl font-bold text-gray-900">{currentCredits}</span>
              </div>
              <p className="text-gray-600">
                {currentCredits === 1 ? t('credits.modal.simple.currentCreditSingular') : t('credits.modal.simple.currentCreditPlural')}
              </p>
            </div>
          </div>

          {/* Info */}
          <div className="text-center space-y-4">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('credits.modal.simple.needMoreCredits')}
              </h3>
              <p className="text-gray-600">
                {t('credits.modal.simple.contactMessage')}
              </p>
            </div>

            {/* Contact */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-center space-x-3">
                <Mail className="h-5 w-5 text-blue-600" />
                <a 
                  href="mailto:kai@open-faces.com"
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  kai@open-faces.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-center text-sm text-gray-600">
            <span>{t('credits.modal.simple.footerMessage')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}