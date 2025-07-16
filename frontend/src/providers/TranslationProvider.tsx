'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

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

  useEffect(() => {
    // Get locale from localStorage or default to 'de'
    const savedLocale = typeof window !== 'undefined' 
      ? localStorage.getItem('locale') || 'de'
      : 'de';
    setLocaleState(savedLocale);
    
    const loadTranslations = async () => {
      try {
        const response = await fetch(`/locales/${savedLocale}/common.json`);
        if (response.ok) {
          const data = await response.json();
          setTranslations(data);
        } else {
          console.error('Failed to fetch translations, status:', response.status);
        }
      } catch (error) {
        console.error('Failed to load translations:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTranslations();
  }, []);

  const setLocale = (newLocale: string) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
    }
    // Reload translations
    const loadTranslations = async () => {
      try {
        const response = await fetch(`/locales/${newLocale}/common.json`);
        if (response.ok) {
          const data = await response.json();
          setTranslations(data);
        } else {
          console.error('Failed to fetch translations, status:', response.status);
        }
      } catch (error) {
        console.error('Failed to load translations:', error);
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