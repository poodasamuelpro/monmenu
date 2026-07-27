// src/i18n/index.ts — Helper i18n FR/EN
// §3 — Internationalisation des pages institutionnelles

import fr from './fr.json'
import en from './en.json'

export type Locale = 'fr' | 'en'
export type Translations = typeof fr

const translations: Record<Locale, Translations> = { fr, en }

/**
 * Retourne les traductions pour la locale donnée.
 * Fallback sur 'fr' si la locale est inconnue.
 */
export function getTranslations(locale: string): Translations {
  const l = (locale === 'en' ? 'en' : 'fr') as Locale
  return translations[l]
}

/**
 * Détecte la langue préférée depuis le header Accept-Language.
 * Retourne 'fr' ou 'en' uniquement.
 */
export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return 'fr'
  const langs = acceptLanguage
    .split(',')
    .map((l) => (l.trim().split(';')[0] ?? '').toLowerCase().slice(0, 2))
  for (const lang of langs) {
    if (lang === 'en') return 'en'
    if (lang === 'fr') return 'fr'
  }
  return 'fr' // Défaut FR
}

/**
 * Extrait la locale depuis le préfixe d'URL (/fr/... ou /en/...).
 * Retourne null si l'URL n'a pas de préfixe i18n.
 */
export function localeFromPath(path: string): Locale | null {
  if (path.startsWith('/fr') && (path === '/fr' || path.startsWith('/fr/'))) return 'fr'
  if (path.startsWith('/en') && (path === '/en' || path.startsWith('/en/'))) return 'en'
  return null
}
