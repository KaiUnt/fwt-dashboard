'use client';

import { Globe } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export function LanguageSwitcher() {
  const { locale, setLocale, loading } = useTranslation();

  const toggleLanguage = () => {
    const newLocale = locale === 'de' ? 'en' : 'de';
    setLocale(newLocale);
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100">
        <Globe className="h-4 w-4 animate-pulse text-gray-600" />
        <span className="text-sm font-medium text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-white border-2 border-gray-400 hover:border-gray-600 hover:bg-gray-50 transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer"
      title={`Switch to ${locale === 'de' ? 'English' : 'Deutsch'}`}
    >
      <Globe className="h-4 w-4 text-gray-800" />
      <span className="text-sm font-bold text-gray-900">
        {locale === 'de' ? 'EN' : 'DE'}
      </span>
    </button>
  );
}