<template>
  <div class="flex min-h-screen flex-col bg-muted px-4 py-12">
    <header class="mx-auto w-full max-w-md pb-8 text-center">
      <RouterLink to="/" class="inline-flex items-center gap-3 text-foreground">
        <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
          As
        </span>
        <span class="flex flex-col text-left leading-tight">
          <span class="text-base font-semibold">Asso</span>
          <span class="text-xs text-muted-foreground">{{ t('app.tagline') }}</span>
        </span>
      </RouterLink>
    </header>

    <main class="mx-auto w-full max-w-md">
      <section class="rounded-3xl border border-outline/40 bg-surface p-8 shadow-soft">
        <slot />
      </section>
    </main>

    <footer class="mx-auto mt-auto w-full max-w-md py-6 text-center text-xs text-muted-foreground">
      <div class="flex flex-col items-center gap-2">
        <span>{{ t('app.footer.copyright', { year: new Date().getFullYear() }) }}</span>
        <AppFooterLinks class="justify-center" />
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

import AppFooterLinks from '@/components/layout/AppFooterLinks.vue';

const { t } = useI18n();
</script>
