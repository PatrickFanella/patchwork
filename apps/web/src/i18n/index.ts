import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import es from './es.json';
import { defaultLocale, supportedLocales } from './types';

/**
 * Detects the preferred locale from the browser, falling back to the default.
 */
const detectBrowserLocale = (): string => {
    if (typeof navigator === 'undefined') {
        return defaultLocale;
    }

    const browserLang = navigator.language?.split('-')[0];

    if (
        browserLang &&
        supportedLocales.includes(browserLang as (typeof supportedLocales)[number])
    ) {
        return browserLang;
    }

    return defaultLocale;
};

void i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        es: { translation: es },
    },
    lng: detectBrowserLocale(),
    fallbackLng: defaultLocale,
    interpolation: {
        escapeValue: false,
    },
    react: {
        useSuspense: false,
    },
});

/**
 * Set the document language attribute on initialization.
 */
if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.language;
}

export default i18n;
export { useLocale } from './useLocale';
export type { SupportedLocale, TranslationKey } from './types';
export {
    formatShortDate,
    formatLongDate,
    formatRelativeTime,
    formatNumber,
    formatCurrency,
    formatPercent,
    formatDistance,
} from './formatting';
