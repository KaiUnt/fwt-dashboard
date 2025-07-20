'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [translations, setTranslations] = useState<Translations>({});
  const [loading, setLoading] = useState(true);
  const [locale, setLocaleState] = useState('de');
  const isOffline = useIsOffline();

  useEffect(() => {
    // Get locale from localStorage or default to 'de'
    const savedLocale = typeof window !== 'undefined' 
      ? localStorage.getItem('locale') || 'de'
      : 'de';
    setLocaleState(savedLocale);
    
    const loadTranslations = async () => {
      try {
        // In offline mode, try to use cached response via fetch (service worker)
        // The service worker should return cached translations if available
        const response = await fetch(`/locales/${savedLocale}/common.json`);
        if (response.ok) {
          const data = await response.json();
          setTranslations(data);
        } else {
          console.error('Failed to fetch translations, status:', response.status);
          // In offline mode, provide better fallback behavior
          if (isOffline) {
            console.warn('Operating in offline mode - translations may not be available');
          }
        }
      } catch (error) {
        console.error('Failed to load translations:', error);
        // In offline mode, provide more context about the error
        if (isOffline) {
          console.warn('Network error in offline mode - check if translations are cached');
        }
      } finally {
        setLoading(false);
      }
    };

    loadTranslations();
  }, [isOffline]);

  const setLocale = (newLocale: string) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
    }
    // Reload translations
    const loadTranslations = async () => {
      try {
        // In offline mode, try to use cached response via fetch (service worker)
        const response = await fetch(`/locales/${newLocale}/common.json`);
        if (response.ok) {
          const data = await response.json();
          setTranslations(data);
        } else {
          console.error('Failed to fetch translations, status:', response.status);
          // In offline mode, provide better fallback behavior
          if (isOffline) {
            console.warn('Operating in offline mode - language switch may not work if translations not cached');
          }
        }
      } catch (error) {
        console.error('Failed to load translations:', error);
        // In offline mode, provide more context about the error
        if (isOffline) {
          console.warn('Network error in offline mode during language switch - check if translations are cached');
        }
      }
    };
    loadTranslations();
  };

  const t = (key: TranslationKey, params?: TranslationParams): string => {
    // If translations are not loaded yet, return a fallback
    if (loading || Object.keys(translations).length === 0) {
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
    <TranslationContext.Provider value={{ t, locale, setLocale, loading }}>
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