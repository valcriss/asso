<template>
  <div class="flex min-h-screen flex-col bg-muted text-foreground">
    <header class="border-b border-outline bg-surface/80">
      <div class="app-container flex items-center justify-between gap-4 py-6">
        <RouterLink to="/" class="inline-flex items-center gap-3 text-foreground">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
            As
          </span>
          <span class="flex flex-col text-left leading-tight">
            <span class="text-base font-semibold">Asso</span>
            <span class="text-xs text-muted-foreground">{{ t('app.tagline') }}</span>
          </span>
        </RouterLink>
        <BaseButton variant="ghost" size="sm" @click="goToLogin">
          {{ t('auth.loginCTA') }}
        </BaseButton>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10">
      <section class="rounded-3xl border border-outline/40 bg-surface p-8 shadow-soft sm:p-10">
        <slot />
      </section>
    </main>

    <footer class="border-t border-outline bg-surface/80 py-6">
      <div class="app-container flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{{ t('app.footer.copyright', { year: new Date().getFullYear() }) }}</span>
        <AppFooterLinks class="justify-start sm:justify-end" />
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

import AppFooterLinks from '@/components/layout/AppFooterLinks.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const router = useRouter();
const { t } = useI18n();

function goToLogin() {
  router.push({ name: 'auth.login' });
}
</script>
