'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsOffline } from '@/hooks/useOfflineStorage';

type TranslationKey = string;
type TranslationParams = Record<string, string | number>;

type TranslationValue = string | { [key: string]: TranslationValue };

interface Translations {
  [key: string]: TranslationValue;
}

interface TranslationContextType {
  t: (key: TranslationKey, params?: TranslationParams) => string;
  locale: string;
  setLocale: (locale: string) => void;
  loading: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

// Prevent multiple simultaneous requests for the same locale
const translationCache = new Map<string, Promise<Translations>>();

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
      const response = await fetch(`/locales/${locale}/common.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch translations: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache in localStorage for offline fallback
      if (typeof window !== 'undefined') {
        localStorage.setItem(`translations-${locale}`, JSON.stringify(data));
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
    const cached = localStorage.getItem(`translations-${locale}`);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Failed to parse cached translations:', error);
    return null;
  }
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState('de');
  const isOffline = useIsOffline();

  // Initialize locale from localStorage
  useEffect(() => {
    const savedLocale = typeof window !== 'undefined' 
      ? localStorage.getItem('locale') || 'de'
      : 'de';
    setLocaleState(savedLocale);
  }, []);

  // Use the same offline-first pattern as event data, but with optimizations to prevent IDB race conditions
  const { data: translations = {}, isLoading } = useQuery({
    queryKey: ['translations', locale],
    queryFn: async (): Promise<Translations> => {
      // Try offline fallback first to avoid unnecessary network requests
      const offlineData = getOfflineTranslations(locale);
      if (offlineData && isOffline) {
        console.log('Loaded translations from offline storage (offline mode)');
        return offlineData;
      }
      
      // Try online if we have internet and no cached data, or if online and data is stale
      if (!isOffline) {
        try {
          return await fetchTranslations(locale);
        } catch (error) {
          console.warn('Online translation fetch failed, trying offline fallback:', error);
          // Fall through to offline fallback
        }
      }
      
      // Final fallback to cached data
      if (offlineData) {
        console.log('Loaded translations from offline storage (fallback)');
        return offlineData;
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