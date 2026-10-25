import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

// To add a language: create locales/<code>.json with the same keys and list it here.
export const LANGUAGES = [
  { code: 'en', label: 'English', resources: en },
  { code: 'de', label: 'Deutsch', resources: de },
] as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: Object.fromEntries(LANGUAGES.map((l) => [l.code, { translation: l.resources }])),
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
