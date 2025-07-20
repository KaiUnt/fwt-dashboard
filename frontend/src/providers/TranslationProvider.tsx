'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsOffline } from '@/hooks/useOfflineStorage';

type TranslationKey = string;
type TranslationParams = Record<string, string | number>;

interface Translations {
  [key: string]: any;
}

interface TranslationContextType {
  t: (key: TranslationKey, params?: TranslationParams) => string;
  locale: string;
  setLocale: (locale: string) => void;
  loading: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

// Fetch function for translations (following the same pattern as event data)
async function fetchTranslations(locale: string): Promise<Translations> {
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

  // Use the same offline-first pattern as event data
  const { data: translations = {}, isLoading } = useQuery({
    queryKey: ['translations', locale],
    queryFn: async (): Promise<Translations> => {
      // Try online first if we have internet (same pattern as useOfflineEventAthletes)
      if (!isOffline) {
        try {
          return await fetchTranslations(locale);
        } catch (error) {
          console.warn('Online translation fetch failed, trying offline fallback:', error);
          // Fall through to offline fallback
        }
      }
      
      // Try offline fallback (localStorage)
      const offlineData = getOfflineTranslations(locale);
      if (offlineData) {
        console.log('Loaded translations from offline storage');
        return offlineData;
      }
      
      // No offline data available
      throw new Error('No offline translations available');
    },
    retry: isOffline ? 0 : 2, // Don't retry in offline mode
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
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
    let value: any = translations;
    
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