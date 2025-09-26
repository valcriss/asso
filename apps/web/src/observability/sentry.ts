import type { App } from 'vue';
import * as Sentry from '@sentry/vue';

export interface SentryOptions {
  app: App<Element>;
}

export function installSentry({ app }: SentryOptions): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info('[sentry] Disabled because no DSN was provided.');
    }

    return;
  }

  const tracesSampleRate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0');

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number.isNaN(tracesSampleRate) ? 0 : tracesSampleRate,
  });
}
