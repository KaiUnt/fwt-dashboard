'use client';

import { Globe } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export function LanguageSwitcher() {
  const { locale, setLocale, loading } = useTranslation();

  const cycleLanguage = () => {
    const locales = ['de', 'en', 'fr'];
    const currentIndex = locales.indexOf(locale);
    const nextIndex = (currentIndex + 1) % locales.length;
    setLocale(locales[nextIndex]);
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
      onClick={cycleLanguage}
      className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-white border-2 border-gray-400 hover:border-gray-600 hover:bg-gray-50 transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer"
      title={`Switch to ${locale === 'de' ? 'English' : locale === 'en' ? 'Français' : 'Deutsch'}`}
    >
      <Globe className="h-4 w-4 text-gray-800" />
      <span className="text-sm font-bold text-gray-900">
        {locale === 'de' ? 'EN' : locale === 'en' ? 'FR' : 'DE'}
      </span>
    </button>
  );
}