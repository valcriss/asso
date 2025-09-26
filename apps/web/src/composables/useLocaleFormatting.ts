import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type DateInput = Date | string | number;

type DateFormatKey = 'short' | 'long';

type NumberFormatKey = 'currency';

export function useLocaleFormatting() {
  const { n, d, locale } = useI18n();

  function formatCurrency(value: number | string | null | undefined, key: NumberFormatKey = 'currency') {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const amount = typeof value === 'number' ? value : Number.parseFloat(value);
    if (Number.isNaN(amount)) {
      return '';
    }

    return n(amount, key);
  }

  function formatDate(value: DateInput | null | undefined, key: DateFormatKey = 'short') {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return d(date, key);
  }

  return {
    locale: computed(() => locale.value),
    formatCurrency,
    formatDate,
  };
}
