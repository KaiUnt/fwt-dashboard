import type { Translations } from '@/types/i18n';

import de from '../../public/locales/de/common.json';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';

const builtInTranslations: Record<string, Translations> = {
  de,
  en,
  fr,
};

export function getBuiltInTranslations(locale: string): Translations | undefined {
  const data = builtInTranslations[locale];
  if (!data) {
    return undefined;
  }
  // Return a cloned object so callers can mutate without affecting the source.
  return JSON.parse(JSON.stringify(data)) as Translations;
}
