<template>
  <div class="flex min-h-screen flex-col bg-muted px-4 py-12">
    <header class="mx-auto w-full max-w-md pb-8 text-center">
      <RouterLink to="/" class="inline-flex items-center gap-3 text-foreground">
        <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
          As
        </span>
        <span class="flex flex-col text-left leading-tight">
          <span class="text-base font-semibold">Asso</span>
          <span class="text-xs text-muted-foreground">Gestion &amp; Comptabilité</span>
        </span>
      </RouterLink>
    </header>

    <main class="mx-auto w-full max-w-md">
      <section class="rounded-3xl border border-outline/40 bg-surface p-8 shadow-soft">
        <slot />
      </section>
    </main>

    <footer class="mx-auto mt-auto w-full max-w-md py-6 text-center text-xs text-muted-foreground">
      &copy; {{ new Date().getFullYear() }} Asso. Tous droits réservés.
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>
