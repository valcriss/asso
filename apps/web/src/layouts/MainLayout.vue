<template>
  <div class="min-h-screen bg-background">
    <header class="border-b border-outline bg-surface/80 backdrop-blur">
      <div class="app-container flex items-center justify-between gap-6 py-4">
        <RouterLink to="/" class="flex items-center gap-3 text-foreground">
          <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
            As
          </span>
          <span class="hidden flex-col leading-tight sm:flex">
            <span class="text-base font-semibold">Asso</span>
            <span class="text-xs text-muted-foreground">Gestion &amp; Comptabilité</span>
          </span>
        </RouterLink>

        <nav class="hidden items-center gap-6 text-sm font-medium md:flex">
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="transition-colors hover:text-primary"
            :class="[currentRouteName === item.matchName ? 'text-primary' : 'text-muted-foreground']"
          >
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-3">
          <BaseButton v-if="canCreateEntry" variant="outline" class="hidden md:inline-flex">
            Nouvelle écriture
          </BaseButton>
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline/80 text-muted-foreground transition-colors hover:text-primary md:hidden"
            @click="toggleSidebar"
          >
            <span class="sr-only">Ouvrir la navigation</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div v-if="user" class="hidden items-center gap-2 rounded-full border border-outline/70 bg-surface px-3 py-1 text-left text-xs md:flex">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
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
            class="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-primary md:inline-flex"
            @click="logout"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </header>

    <Transition name="fade">
      <div v-if="isSidebarOpen" class="fixed inset-0 z-30 bg-black/30 md:hidden" @click="closeSidebar"></div>
    </Transition>

    <aside
      class="fixed inset-y-0 right-0 z-40 flex w-72 flex-col gap-8 border-l border-outline/80 bg-surface px-6 py-8 shadow-soft transition-transform md:hidden"
      :class="[isSidebarOpen ? 'translate-x-0' : 'translate-x-full']"
    >
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-sm font-medium text-muted-foreground">Navigation</span>
          <span class="text-lg font-semibold text-foreground">Asso</span>
        </div>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline/80 text-muted-foreground transition-colors hover:text-primary"
          @click="closeSidebar"
        >
          <span class="sr-only">Fermer</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m6 18 12-12M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav class="flex flex-col gap-3 text-sm font-medium">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-2 transition-colors hover:bg-muted/80"
          :class="[currentRouteName === item.matchName ? 'bg-primary/10 text-primary' : 'text-muted-foreground']"
          @click="closeSidebar"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <BaseButton v-if="canCreateEntry" variant="primary" class="mt-auto">Nouvelle écriture</BaseButton>
      <button
        v-if="isAuthenticated"
        type="button"
        class="text-left text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        @click="logout"
      >
        Se déconnecter
      </button>
    </aside>

    <main class="app-container grid gap-6 py-10 md:grid-cols-[220px,1fr]">
      <aside
        v-if="navigation.length"
        class="hidden h-fit rounded-2xl border border-outline/60 bg-surface p-6 shadow-soft md:block"
      >
        <nav class="flex flex-col gap-2 text-sm font-medium">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">Navigation</p>
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-3 py-2 transition-colors hover:bg-muted/70"
            :class="[currentRouteName === item.matchName ? 'bg-primary/10 text-primary' : 'text-muted-foreground']"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </aside>

      <section class="min-h-[60vh] rounded-3xl border border-outline/40 bg-surface px-6 py-8 shadow-soft sm:px-10">
        <slot />
      </section>
    </main>

    <footer class="border-t border-outline bg-surface/80 py-6">
      <div class="app-container flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>&copy; {{ new Date().getFullYear() }} Asso. Tous droits réservés.</span>
        <div class="flex flex-wrap gap-4">
          <a href="#" class="transition-colors hover:text-primary">Mentions légales</a>
          <a href="#" class="transition-colors hover:text-primary">Politique de confidentialité</a>
          <a href="#" class="transition-colors hover:text-primary">Support</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import BaseButton from '@/components/ui/BaseButton.vue';
import { useAppStore, useAuthStore, type UserRole } from '@/store';

interface NavigationItem {
  label: string;
  to: string;
  matchName: string;
  requiredRoles?: UserRole[];
  requiresSuperAdmin?: boolean;
}

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();

const rawNavigation = computed<NavigationItem[]>(() => [
  {
    label: 'Tableau de bord',
    to: '/',
    matchName: 'dashboard.home',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    label: 'Comptabilité',
    to: '/comptabilite',
    matchName: 'accounting.overview',
    requiredRoles: ['ADMIN', 'TREASURER'] as UserRole[],
  },
  {
    label: 'Membres',
    to: '/membres',
    matchName: 'members.list',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'] as UserRole[],
  },
  {
    label: 'Projets',
    to: '/projets',
    matchName: 'projects.list',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    label: 'Subventions',
    to: '/subventions',
    matchName: 'grants.list',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'] as UserRole[],
  },
  {
    label: 'Portail adhérent',
    to: '/portail/membre',
    matchName: 'members.selfService',
    requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'] as UserRole[],
  },
  {
    label: 'Supervision',
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
