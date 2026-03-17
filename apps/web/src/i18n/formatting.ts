import type { SupportedLocale } from './types';

/**
 * Locale-aware date formatting using the Intl.DateTimeFormat API.
 */

const localeTagMap: Readonly<Record<SupportedLocale, string>> = {
    en: 'en-US',
    es: 'es-ES',
};

export const resolveLocaleTag = (locale: SupportedLocale): string => {
    return localeTagMap[locale] ?? localeTagMap.en;
};

export const formatShortDate = (
    date: Date | string,
    locale: SupportedLocale,
): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) {
        return String(date);
    }

    return new Intl.DateTimeFormat(resolveLocaleTag(locale), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(d);
};

export const formatLongDate = (
    date: Date | string,
    locale: SupportedLocale,
): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) {
        return String(date);
    }

    return new Intl.DateTimeFormat(resolveLocaleTag(locale), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
};

export const formatRelativeTime = (
    date: Date | string,
    locale: SupportedLocale,
    now?: Date,
): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const reference = now ?? new Date();
    if (Number.isNaN(d.getTime())) {
        return String(date);
    }

    const diffMs = d.getTime() - reference.getTime();
    const diffSeconds = Math.round(diffMs / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);

    const rtf = new Intl.RelativeTimeFormat(resolveLocaleTag(locale), {
        numeric: 'auto',
    });

    if (Math.abs(diffSeconds) < 60) {
        return rtf.format(diffSeconds, 'second');
    }
    if (Math.abs(diffMinutes) < 60) {
        return rtf.format(diffMinutes, 'minute');
    }
    if (Math.abs(diffHours) < 24) {
        return rtf.format(diffHours, 'hour');
    }
    return rtf.format(diffDays, 'day');
};

/**
 * Locale-aware number formatting using Intl.NumberFormat.
 */
export const formatNumber = (
    value: number,
    locale: SupportedLocale,
    options?: Intl.NumberFormatOptions,
): string => {
    return new Intl.NumberFormat(resolveLocaleTag(locale), options).format(
        value,
    );
};

export const formatCurrency = (
    value: number,
    locale: SupportedLocale,
    currency = 'USD',
): string => {
    return new Intl.NumberFormat(resolveLocaleTag(locale), {
        style: 'currency',
        currency,
    }).format(value);
};

export const formatPercent = (
    value: number,
    locale: SupportedLocale,
): string => {
    return new Intl.NumberFormat(resolveLocaleTag(locale), {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    }).format(value);
};

/**
 * Locale-aware distance formatting for map radii.
 */
export const formatDistance = (
    meters: number,
    locale: SupportedLocale,
): string => {
    if (meters >= 1000) {
        const km = meters / 1000;
        return `${formatNumber(km, locale, { maximumFractionDigits: 1 })} km`;
    }
    return `${formatNumber(Math.round(meters), locale)} m`;
};
