import type en from './en.json';

/**
 * Type-safe translation resources derived from the English locale file.
 * All other locales must match this structure.
 */
export type TranslationResources = typeof en;

/**
 * Recursively extracts all dot-notation keys from the translation resource object.
 * For example: 'app.title' | 'nav.home' | 'dashboard.heading' | ...
 */
type NestedKeys<T, Prefix extends string = ''> = T extends string
    ? Prefix
    : T extends Record<string, unknown>
      ? {
            [K in keyof T & string]: NestedKeys<
                T[K],
                Prefix extends '' ? K : `${Prefix}.${K}`
            >;
        }[keyof T & string]
      : never;

export type TranslationKey = NestedKeys<TranslationResources>;

/**
 * Supported locale codes.
 */
export type SupportedLocale = 'en' | 'es';

export const supportedLocales: readonly SupportedLocale[] = ['en', 'es'];

export const localeDisplayNames: Readonly<Record<SupportedLocale, string>> = {
    en: 'English',
    es: 'Espanol',
};

export const defaultLocale: SupportedLocale = 'en';
