<template>
  <div class="space-y-10">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold text-foreground">{{ t('settings.pageTitle') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('settings.pageDescription') }}</p>
    </header>

    <form class="space-y-10" @submit.prevent="savePreferences">
      <section class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-foreground">{{ t('settings.sections.locale.title') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('settings.sections.locale.description') }}</p>
        </div>
        <label class="block text-sm font-medium text-foreground" :for="ids.localeSelect">
          {{ t('settings.sections.locale.selectLabel') }}
        </label>
        <select
          :id="ids.localeSelect"
          v-model="selectedLocale"
          class="mt-1 w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-foreground shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <option v-for="option in localeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </section>

      <section class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-foreground">{{ t('settings.sections.currency.title') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('settings.sections.currency.description') }}</p>
        </div>
        <label class="block text-sm font-medium text-foreground" :for="ids.currencySelect">
          {{ t('settings.sections.currency.selectLabel') }}
        </label>
        <select
          :id="ids.currencySelect"
          v-model="selectedCurrency"
          class="mt-1 w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-foreground shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <option v-for="option in currencyOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <p class="text-sm text-muted-foreground">{{ currencyPreview }}</p>
      </section>

      <div class="flex flex-wrap items-center gap-3">
        <BaseButton type="submit">{{ t('actions.save') }}</BaseButton>
        <BaseButton type="button" variant="ghost" @click="resetPreferences">
          {{ t('actions.cancel') }}
        </BaseButton>
        <span v-if="feedbackMessage" class="text-sm text-accent" role="status" aria-live="polite">
          {{ feedbackMessage }}
        </span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import BaseButton from '@/components/ui/BaseButton.vue';
import { useAppStore } from '@/store';
import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES, type AppLocale, type CurrencyCode } from '@/lib/i18n';

const appStore = useAppStore();
const { t } = useI18n();

const selectedLocale = ref<AppLocale>(appStore.locale);
const selectedCurrency = ref<CurrencyCode>(appStore.currency);
const feedbackMessage = ref('');

const ids = reactive({
  localeSelect: 'settings-locale-select',
  currencySelect: 'settings-currency-select',
});

const localeOptions = computed(() =>
  SUPPORTED_LOCALES.map((value) => ({
    value,
    label: t(`settings.options.locales.${value}`),
  })),
);

const currencyOptions = computed(() =>
  SUPPORTED_CURRENCIES.map((value) => ({
    value,
    label: t(`settings.options.currencies.${value}`),
  })),
);

const currencyPreview = computed(() => {
  const formatter = new Intl.NumberFormat(selectedLocale.value, {
    style: 'currency',
    currency: selectedCurrency.value,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dateFormatter = new Intl.DateTimeFormat(selectedLocale.value, { dateStyle: 'medium' });
  return t('settings.sections.currency.preview', {
    amount: formatter.format(1234.56),
    date: dateFormatter.format(new Date()),
  });
});

function resetPreferences() {
  selectedLocale.value = appStore.locale;
  selectedCurrency.value = appStore.currency;
  feedbackMessage.value = '';
}

function savePreferences() {
  appStore.setLocale(selectedLocale.value);
  appStore.setCurrency(selectedCurrency.value);
  feedbackMessage.value = t('settings.notifications.saved');
}
</script>
