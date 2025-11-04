export type TranslationValue = string | { [key: string]: TranslationValue };

export interface Translations {
  [key: string]: TranslationValue;
}
