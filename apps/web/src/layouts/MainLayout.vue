<template>
  <div class="min-h-screen bg-background">
    <header class="border-b border-outline bg-surface/80 backdrop-blur">
      <div class="app-container flex items-center justify-between py-4">
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
          <BaseButton variant="outline" class="hidden md:inline-flex">Nouvelle écriture</BaseButton>
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
      <BaseButton variant="primary" class="mt-auto">Nouvelle écriture</BaseButton>
    </aside>

    <main class="app-container grid gap-6 py-10 md:grid-cols-[220px,1fr]">
      <aside class="hidden h-fit rounded-2xl border border-outline/60 bg-surface p-6 shadow-soft md:block">
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
import { useRoute } from 'vue-router';

import BaseButton from '@/components/ui/BaseButton.vue';
import { useAppStore } from '@/store';

const route = useRoute();
const appStore = useAppStore();

const navigation = computed(() => [
  { label: 'Tableau de bord', to: '/', matchName: 'dashboard.home' },
  { label: 'Comptabilité', to: '/comptabilite', matchName: 'accounting.overview' },
  { label: 'Membres', to: '/membres', matchName: 'members.list' },
  { label: 'Subventions', to: '/subventions', matchName: 'grants.list' },
]);

const isSidebarOpen = computed(() => appStore.sidebarOpen);
const currentRouteName = computed(() => route.name);

function toggleSidebar() {
  appStore.toggleSidebar();
}

function closeSidebar() {
  appStore.closeSidebar();
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
