'use client'

import { useState, useEffect } from 'react'
import { X, Coins, CreditCard, Clock, TrendingUp, Gift, ShoppingCart } from 'lucide-react'
import useCredits from '@/hooks/useCredits'
import { isSupabaseConfigured } from '@/utils/supabase'
import { useTranslation } from '@/providers/TranslationProvider'

// interface Transaction {
//   id: string
//   transaction_type: string
//   amount: number
//   credits_before: number
//   credits_after: number
//   description: string
//   created_at: string
//   event_id?: string
// }

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
  const [activeTab, setActiveTab] = useState<'overview' | 'purchase' | 'history'>('overview')
  const { packages, transactions, initiatePurchase } = useCredits()
  const { t } = useTranslation()

  // Update parent component when credits change
  useEffect(() => {
    if (isOpen) {
      onCreditsUpdate(currentCredits)
    }
  }, [currentCredits, isOpen, onCreditsUpdate])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <CreditCard className="h-4 w-4 text-green-400" />
      case 'spend': return <ShoppingCart className="h-4 w-4 text-red-400" />
      case 'grant': return <Gift className="h-4 w-4 text-blue-400" />
      case 'refund': return <TrendingUp className="h-4 w-4 text-yellow-400" />
      default: return <Coins className="h-4 w-4 text-gray-400" />
    }
  }

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'purchase': return 'text-green-400'
      case 'spend': return 'text-red-400'
      case 'grant': return 'text-blue-400'
      case 'refund': return 'text-yellow-400'
      default: return 'text-gray-400'
    }
  }

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
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-xl">
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'overview', label: t('credits.modal.tabs.overview'), icon: TrendingUp },
            { key: 'purchase', label: t('credits.modal.tabs.purchase'), icon: CreditCard },
            { key: 'history', label: t('credits.modal.tabs.history'), icon: Clock }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as 'overview' | 'purchase' | 'history')}
              className={`flex-1 flex items-center justify-center space-x-2 py-4 px-6 transition-colors ${
                activeTab === key
                  ? 'border-b-2 border-yellow-600 text-yellow-600 bg-yellow-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Current Balance */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <Coins className="h-8 w-8 text-yellow-600" />
                    <span className="text-3xl font-bold text-gray-900">{currentCredits}</span>
                  </div>
                  <p className="text-gray-600">
                    {currentCredits === 1 ? t('credits.modal.overview.creditAvailable') : t('credits.modal.overview.creditsAvailable')}
                  </p>
                </div>
              </div>

              {/* Quick Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{t('credits.modal.overview.eventAccess')}</h3>
                  <p className="text-sm text-gray-600">
                    {t('credits.modal.overview.eventAccessDesc')}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{t('credits.modal.overview.freeEvents')}</h3>
                  <p className="text-sm text-gray-600">
                    {t('credits.modal.overview.freeEventsDesc')}
                  </p>
                </div>
              </div>

              {/* Call to Action */}
              {currentCredits === 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="font-semibold text-red-700 mb-2">{t('credits.modal.overview.noCreditsTitle')}</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    {t('credits.modal.overview.noCreditsDesc')}
                  </p>
                  <button
                    onClick={() => setActiveTab('purchase')}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {t('credits.modal.overview.buyCredits')}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'purchase' && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('credits.modal.purchase.title')}</h3>
                <p className="text-gray-600">{t('credits.modal.purchase.subtitle')}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {packages.map((pkg) => (
                  <div
                    key={pkg.package_type}
                    className={`bg-white rounded-lg p-6 border-2 transition-colors shadow-sm ${
                      pkg.package_type === 'pack_10'
                        ? 'border-yellow-400 bg-yellow-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      {pkg.package_type === 'pack_10' && (
                        <div className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full inline-block mb-3">
                          {t('credits.modal.purchase.bestValue')}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-center space-x-1 mb-2">
                        <Coins className="h-6 w-6 text-yellow-600" />
                        <span className="text-2xl font-bold text-gray-900">{pkg.credits}</span>
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-4">
                        {pkg.credits === 1 ? t('credits.credit') : t('credits.credits')}
                      </p>
                      
                      <div className="text-3xl font-bold text-gray-900 mb-4">
                        {pkg.price_display}
                      </div>
                      
                      {pkg.package_type !== 'single' && (
                        <div className="text-sm text-gray-600 mb-4">
                          {(pkg.price_cents / pkg.credits / 100).toFixed(2)}€ {t('credits.modal.purchase.perCredit')}
                        </div>
                      )}
                      
                      <button
                        className={`w-full py-2 px-4 rounded-lg transition-colors ${
                          pkg.package_type === 'pack_10'
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            : 'bg-gray-600 hover:bg-gray-700 text-white'
                        }`}
                        onClick={() => initiatePurchase(pkg.package_type)}
                      >
                        {t('credits.modal.purchase.buy')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-700 mb-2">{t('credits.modal.purchase.securePayment')}</h4>
                <p className="text-sm text-gray-700">
                  {t('credits.modal.purchase.securePaymentDesc')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">{t('credits.modal.history.title')}</h3>
                <span className="text-sm text-gray-600">{transactions.length} {t('credits.modal.history.entries')}</span>
              </div>

              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-600">{t('credits.modal.history.noTransactions')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        {getTransactionIcon(transaction.transaction_type)}
                        <div>
                          <p className="font-medium text-gray-900">{transaction.description}</p>
                          <p className="text-sm text-gray-600">
                            {formatDate(transaction.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className={`font-semibold ${getTransactionColor(transaction.transaction_type)}`}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount} Credits
                        </div>
                        <div className="text-sm text-gray-600">
                          {t('credits.modal.history.balance')}: {transaction.credits_after}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{t('credits.modal.footer.systemName')}</span>
            <span>{t('credits.modal.footer.phase')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}