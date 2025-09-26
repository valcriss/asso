import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { installSentry } from './observability/sentry';
import { createAppI18n, updateCurrencyFormat } from './lib/i18n';
import { useAppStore } from './store';

import './styles/main.css';

const app = createApp(App);

const pinia = createPinia();
app.use(pinia);
app.use(router);

const appStore = useAppStore(pinia);
appStore.hydratePreferences();

const i18n = createAppI18n(appStore.locale, appStore.currency);
app.use(i18n);

watch(
  () => appStore.locale,
  (locale) => {
    i18n.global.locale.value = locale;
  },
  { immediate: true },
);

watch(
  () => appStore.currency,
  (currency) => {
    updateCurrencyFormat(i18n, currency);
  },
  { immediate: true },
);

installSentry({ app });

app.mount('#app');
