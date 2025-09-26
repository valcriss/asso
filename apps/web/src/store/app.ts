import { defineStore } from 'pinia';

import { DEFAULT_CURRENCY, DEFAULT_LOCALE, type AppLocale, type CurrencyCode } from '@/lib/i18n';

interface AppPreferences {
  locale: AppLocale;
  currency: CurrencyCode;
}

interface AppState extends AppPreferences {
  sidebarOpen: boolean;
  isHydrated: boolean;
}

const STORAGE_KEY = 'asso.app.preferences';

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    sidebarOpen: false,
    locale: DEFAULT_LOCALE,
    currency: DEFAULT_CURRENCY,
    isHydrated: false,
  }),
  actions: {
    hydratePreferences() {
      if (this.isHydrated) {
        return;
      }

      if (typeof window === 'undefined') {
        this.isHydrated = true;
        return;
      }

      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<AppPreferences>;
          if (parsed.locale && typeof parsed.locale === 'string') {
            this.locale = parsed.locale as AppLocale;
          }
          if (parsed.currency && typeof parsed.currency === 'string') {
            this.currency = parsed.currency as CurrencyCode;
          }
        } catch (error) {
          console.warn('Unable to parse persisted preferences', error);
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      this.isHydrated = true;
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    closeSidebar() {
      this.sidebarOpen = false;
    },
    setLocale(locale: AppLocale) {
      this.locale = locale;
      this.persistPreferences();
    },
    setCurrency(currency: CurrencyCode) {
      this.currency = currency;
      this.persistPreferences();
    },
    persistPreferences() {
      if (typeof window === 'undefined') {
        return;
      }

      const payload: AppPreferences = {
        locale: this.locale,
        currency: this.currency,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },
  },
});
