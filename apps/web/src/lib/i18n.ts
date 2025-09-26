import { createI18n } from 'vue-i18n';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_LOCALE: AppLocale = 'fr';
export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

export function createAppI18n(locale: AppLocale = DEFAULT_LOCALE, currency: CurrencyCode = DEFAULT_CURRENCY) {
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    messages: {
      en,
      fr,
    },
    datetimeFormats: {
      en: {
        short: {
          dateStyle: 'medium',
        },
        long: {
          dateStyle: 'full',
        },
      },
      fr: {
        short: {
          dateStyle: 'medium',
        },
        long: {
          dateStyle: 'full',
        },
      },
    },
    numberFormats: {
      en: {
        currency: createCurrencyOptions(currency),
      },
      fr: {
        currency: createCurrencyOptions(currency),
      },
    },
  });

  return i18n;
}

export function updateCurrencyFormat(
  i18n: ReturnType<typeof createAppI18n>,
  currency: CurrencyCode,
  locales: readonly AppLocale[] = SUPPORTED_LOCALES,
) {
  for (const locale of locales) {
    i18n.global.setNumberFormat(locale, 'currency', createCurrencyOptions(currency));
  }
}

function createCurrencyOptions(currency: CurrencyCode): Intl.NumberFormatOptions {
  return {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
}
