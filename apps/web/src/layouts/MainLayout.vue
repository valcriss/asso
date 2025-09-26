<template>
  <div class="min-h-screen bg-background">
    <header class="border-b border-outline bg-surface/80 backdrop-blur">
      <div class="app-container flex items-center justify-between gap-6 py-4">
        <RouterLink to="/" class="flex items-center gap-3 text-foreground">
          <span
            class="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            As
          </span>
          <span class="hidden flex-col leading-tight sm:flex">
            <span class="text-base font-semibold">{{ t('app.name') }}</span>
            <span class="text-xs text-muted-foreground">{{ t('app.tagline') }}</span>
          </span>
        </RouterLink>

        <nav
          :aria-label="t('app.navigation.main')"
          class="hidden items-center gap-6 text-sm font-medium md:flex"
        >
          <RouterLink
            v-for="item in navigation"
            :id="`${navigationId}-link-${item.matchName}`"
            :key="item.to"
            :to="item.to"
            class="rounded-md px-2 py-1 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="[currentRouteName === item.matchName ? 'text-primary font-semibold' : 'text-muted-foreground']"
          >
            {{ t(item.labelKey) }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-3">
          <BaseButton v-if="canCreateEntry" variant="outline" class="hidden md:inline-flex">
            {{ t('actions.newEntry') }}
          </BaseButton>
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline/80 text-muted-foreground transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
            :aria-expanded="isSidebarOpen"
            :aria-controls="navigationId"
            :aria-label="t('layout.openNavigation')"
            @click="toggleSidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div
            v-if="user"
            class="hidden items-center gap-2 rounded-full border border-outline/70 bg-surface px-3 py-1 text-left text-xs md:flex"
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary" aria-hidden="true">
              {{ userInitials }}
            </span>
            <div class="flex flex-col leading-tight">
              <span class="text-sm font-medium text-foreground">{{ user.displayName ?? user.email }}</span>
              <span class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ user.roles.join(', ') }}
              </span>
            </div>
          </div>
          <button
            v-if="isAuthenticated"
            type="button"
            class="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:inline-flex"
            @click="logout"
          >
            {{ t('auth.logout') }}
          </button>
        </div>
      </div>
    </header>

    <Transition name="fade">
      <div v-if="isSidebarOpen" class="fixed inset-0 z-30 bg-black/30 md:hidden" @click="closeSidebar"></div>
    </Transition>

    <aside
      :id="navigationId"
      class="fixed inset-y-0 right-0 z-40 flex w-72 flex-col gap-8 border-l border-outline/80 bg-surface px-6 py-8 shadow-soft transition-transform md:hidden"
      :class="[isSidebarOpen ? 'translate-x-0' : 'translate-x-full']"
      @keydown.esc.prevent="closeSidebar"
    >
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-sm font-medium text-muted-foreground">{{ t('app.navigation.title') }}</span>
          <span class="text-lg font-semibold text-foreground">{{ t('app.name') }}</span>
        </div>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline/80 text-muted-foreground transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :aria-label="t('layout.close')"
          @click="closeSidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="m6 18 12-12M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav class="flex flex-col gap-3 text-sm font-medium" :aria-label="t('app.navigation.sidebar')">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-2 transition-colors hover:bg-muted/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="[currentRouteName === item.matchName ? 'bg-primary text-primary-foreground' : 'text-muted-foreground']"
          @click="closeSidebar"
        >
          {{ t(item.labelKey) }}
        </RouterLink>
      </nav>
      <BaseButton v-if="canCreateEntry" variant="primary" class="mt-auto">
        {{ t('actions.newEntry') }}
      </BaseButton>
      <button
        v-if="isAuthenticated"
        type="button"
        class="text-left text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="logout"
      >
        {{ t('auth.logout') }}
      </button>
    </aside>

    <main class="app-container grid gap-6 py-10 md:grid-cols-[220px,1fr]">
      <aside
        v-if="navigation.length"
        class="hidden h-fit rounded-2xl border border-outline/60 bg-surface p-6 shadow-soft md:block"
      >
        <nav class="flex flex-col gap-2 text-sm font-medium" :aria-label="t('app.navigation.sidebar')">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('app.navigation.title') }}</p>
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-3 py-2 transition-colors hover:bg-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="[currentRouteName === item.matchName ? 'bg-primary text-primary-foreground' : 'text-muted-foreground']"
          >
            {{ t(item.labelKey) }}
          </RouterLink>
        </nav>
      </aside>

      <section class="min-h-[60vh] rounded-3xl border border-outline/40 bg-surface px-6 py-8 shadow-soft sm:px-10">
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
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import BaseButton from '@/components/ui/BaseButton.vue';
import { useAppStore, useAuthStore, type UserRole } from '@/store';
import AppFooterLinks from '@/components/layout/AppFooterLinks.vue';

interface NavigationItem {
  labelKey: string;
  to: string;
  matchName: string;
  requiredRoles?: UserRole[];
  requiresSuperAdmin?: boolean;
}

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const { t } = useI18n();

const navigationId = 'app-navigation';

const rawNavigation = computed<NavigationItem[]>(() => [
  {
    labelKey: 'app.navigation.dashboard',
    to: '/',
    matchName: 'dashboard.home',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.accounting',
    to: '/comptabilite',
    matchName: 'accounting.overview',
    requiredRoles: ['ADMIN', 'TREASURER'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.members',
    to: '/membres',
    matchName: 'members.list',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.projects',
    to: '/projets',
    matchName: 'projects.list',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.grants',
    to: '/subventions',
    matchName: 'grants.list',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.memberPortal',
    to: '/portail/membre',
    matchName: 'members.selfService',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.settings',
    to: '/parametres',
    matchName: 'settings.preferences',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    labelKey: 'app.navigation.supervision',
    to: '/supervision',
    matchName: 'superAdmin.panel',
    requiresSuperAdmin: true,
  },
]);

const navigation = computed(() =>
  rawNavigation.value.filter((item) => {
    if (item.requiresSuperAdmin && !authStore.isSuperAdmin) {
      return false;
    }
    if (!item.requiredRoles) {
      return true;
    }
    return authStore.hasAnyRole(item.requiredRoles);
  }),
);

const isSidebarOpen = computed(() => appStore.sidebarOpen);
const currentRouteName = computed(() => route.name);
const isAuthenticated = computed(() => authStore.isAuthenticated);
const user = computed(() => authStore.user);
const canCreateEntry = computed(() => authStore.hasAnyRole(['ADMIN', 'TREASURER']));
const userInitials = computed(() => {
  if (!user.value) {
    return '';
  }
  const name = user.value.displayName ?? user.value.email;
  const initials = name
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');

  return initials.slice(0, 2);
});

function toggleSidebar() {
  appStore.toggleSidebar();
}

function closeSidebar() {
  appStore.closeSidebar();
}

async function logout() {
  authStore.logout();
  await router.push({ name: 'auth.login' });
}

watch(
  () => route.fullPath,
  () => {
    if (isSidebarOpen.value) {
      closeSidebar();
    }
  },
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', closeSidebar);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', closeSidebar);
  }
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
