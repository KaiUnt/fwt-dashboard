'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsOffline } from '@/hooks/useOfflineStorage';
import type { TranslationValue, Translations } from '@/types/i18n';
import { getBuiltInTranslations } from '@/translations/builtIn';

type TranslationKey = string;
type TranslationParams = Record<string, string | number>;

// Pluralization rules for different languages
const pluralRules = {
  de: (count: number) => count === 1 ? 'Singular' : 'Plural',
  en: (count: number) => count === 1 ? 'Singular' : 'Plural',
  fr: (count: number) => count === 1 ? 'Singular' : 'Plural',
} as const;

interface TranslationContextType {
  t: (key: TranslationKey, params?: TranslationParams) => string;
  locale: string;
  setLocale: (locale: string) => void;
  loading: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

const TRANSLATION_VERSION = '2025-02-12-custom-fields';

// Prevent multiple simultaneous requests for the same locale
const translationCache = new Map<string, Promise<Translations>>();

// Get default locale with browser language detection
const getDefaultLocale = (): string => {
  if (typeof window === 'undefined') return 'de';
  
  // Check localStorage first
  const savedLocale = localStorage.getItem('locale');
  if (savedLocale && ['de', 'en', 'fr'].includes(savedLocale)) {
    return savedLocale;
  }
  
  // Try to detect from browser language
  const browserLang = navigator.language.split('-')[0];
  if (['de', 'en', 'fr'].includes(browserLang)) {
    return browserLang;
  }
  
  // Fallback to German
  return 'de';
};

// Fetch function for translations (following the same pattern as event data)
async function fetchTranslations(locale: string): Promise<Translations> {
  // Check if we're already fetching this locale
  const cachedPromise = translationCache.get(locale);
  if (cachedPromise) {
    return cachedPromise;
  }
  
  // Create new fetch promise and cache it
  const fetchPromise = (async () => {
    try {
      const response = await fetch(`/locales/${locale}/common.json?v=${TRANSLATION_VERSION}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch translations: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache in localStorage for offline fallback
      if (typeof window !== 'undefined') {
        localStorage.setItem(`translations-${TRANSLATION_VERSION}-${locale}`, JSON.stringify(data));
      }
      
      return data;
    } finally {
      // Remove from cache when done (success or failure)
      translationCache.delete(locale);
    }
  })();
  
  translationCache.set(locale, fetchPromise);
  return fetchPromise;
}

// Get translations from localStorage (offline fallback)
function getOfflineTranslations(locale: string): Translations | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(`translations-${TRANSLATION_VERSION}-${locale}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState('de');
  const isOffline = useIsOffline();

  // Initialize locale with browser detection
  useEffect(() => {
    const defaultLocale = getDefaultLocale();
    setLocaleState(defaultLocale);
  }, []);

  // Use the same offline-first pattern as event data, but with optimizations to prevent IDB race conditions
  const { data: translations = {}, isLoading } = useQuery({
    queryKey: ['translations', locale],
    queryFn: async (): Promise<Translations> => {
      // Try offline cache first
      const offlineData = getOfflineTranslations(locale);
      if (offlineData) {
        return offlineData;
      }

      // Try online if we have internet and no cached data
      if (!isOffline) {
        try {
          return await fetchTranslations(locale);
        } catch {
          // Fall through to offline fallback
        }
      }
      
      // Fallback to built-in translations bundled with the app
      const builtIn = getBuiltInTranslations(locale);
      if (builtIn) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`translations-${TRANSLATION_VERSION}-${locale}`, JSON.stringify(builtIn));
        }
        return builtIn;
      }
      
      // No offline data available
      throw new Error('No offline translations available');
    },
    retry: isOffline ? 0 : 1, // Reduce retries to minimize race conditions
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    refetchOnReconnect: false, // Don't refetch immediately on reconnect
    staleTime: 30 * 60 * 1000, // 30 minutes - longer stale time to reduce requests
    gcTime: 60 * 60 * 1000, // 1 hour garbage collection
    initialData: () => getBuiltInTranslations(locale),
  });

  const setLocale = (newLocale: string) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
    }
    // React Query will automatically refetch when locale changes due to queryKey dependency
  };

  const t = (key: TranslationKey, params?: TranslationParams): string => {
    // If translations are not loaded yet, return a fallback
    if (isLoading || Object.keys(translations).length === 0) {
      return key;
    }
    
    const keys = key.split('.');
    let value: TranslationValue = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Return key if translation not found
      }
    }
    
    if (typeof value !== 'string') {
      return key;
    }
    
    // Handle pluralization if count parameter is provided
    if (params?.count !== undefined) {
      const count = Number(params.count);
      const pluralRule = pluralRules[locale as keyof typeof pluralRules];
      if (pluralRule) {
        const pluralForm = pluralRule(count);
        const pluralKey = `${key}${pluralForm}`;
        
        // Try to get the pluralized version
        const pluralKeys = pluralKey.split('.');
        let pluralValue: TranslationValue = translations;
        
        for (const k of pluralKeys) {
          if (pluralValue && typeof pluralValue === 'object' && k in pluralValue) {
            pluralValue = pluralValue[k];
          } else {
            break; // Fall back to original key
          }
        }
        
        if (typeof pluralValue === 'string') {
          value = pluralValue;
        }
      }
    }
    
    // Replace parameters in translation
    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }
    
    return value;
  };

  return (
    <TranslationContext.Provider value={{ t, locale, setLocale, loading: isLoading }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
