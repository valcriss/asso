import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { installSentry } from './observability/sentry';

import './styles/main.css';

const app = createApp(App);

const pinia = createPinia();
app.use(pinia);
app.use(router);

installSentry({ app });

app.mount('#app');
