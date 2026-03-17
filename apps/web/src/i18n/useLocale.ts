import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    formatCurrency,
    formatDistance,
    formatLongDate,
    formatNumber,
    formatPercent,
    formatRelativeTime,
    formatShortDate,
} from './formatting';
import {
    type SupportedLocale,
    defaultLocale,
    supportedLocales,
} from './types';

/**
 * Custom hook that wraps react-i18next's useTranslation with
 * type-safe locale formatting utilities and language switching.
 */
export const useLocale = () => {
    const { t, i18n } = useTranslation();

    const currentLocale = (
        supportedLocales.includes(i18n.language as SupportedLocale)
            ? i18n.language
            : defaultLocale
    ) as SupportedLocale;

    const changeLocale = useCallback(
        (locale: SupportedLocale) => {
            void i18n.changeLanguage(locale);

            if (typeof document !== 'undefined') {
                document.documentElement.lang = locale;
            }
        },
        [i18n],
    );

    const fmt = useMemo(
        () => ({
            shortDate: (date: Date | string) =>
                formatShortDate(date, currentLocale),
            longDate: (date: Date | string) =>
                formatLongDate(date, currentLocale),
            relativeTime: (date: Date | string, now?: Date) =>
                formatRelativeTime(date, currentLocale, now),
            number: (value: number, options?: Intl.NumberFormatOptions) =>
                formatNumber(value, currentLocale, options),
            currency: (value: number, currency?: string) =>
                formatCurrency(value, currentLocale, currency),
            percent: (value: number) => formatPercent(value, currentLocale),
            distance: (meters: number) =>
                formatDistance(meters, currentLocale),
        }),
        [currentLocale],
    );

    return {
        t,
        i18n,
        locale: currentLocale,
        changeLocale,
        fmt,
        supportedLocales,
    } as const;
};
