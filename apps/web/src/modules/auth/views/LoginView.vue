<template>
  <section class="space-y-8">
    <header class="space-y-2 text-center">
      <h1 class="text-3xl font-display font-semibold text-foreground">Connexion</h1>
      <p class="text-sm text-muted-foreground">Accédez à votre espace de gestion associatif.</p>
    </header>

    <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
      <div class="space-y-1">
        <label for="email" class="text-sm font-medium text-foreground">Adresse e-mail</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          required
          class="w-full rounded-xl border border-outline/60 bg-background px-4 py-3 text-sm text-foreground shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div class="space-y-1">
        <label for="password" class="text-sm font-medium text-foreground">Mot de passe</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-xl border border-outline/60 bg-background px-4 py-3 text-sm text-foreground shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <p v-if="errorMessage" class="text-sm text-destructive" role="alert">{{ errorMessage }}</p>

      <button
        type="submit"
        class="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="!canSubmit"
      >
        <svg
          v-if="isSubmitting"
          class="mr-2 h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a12 12 0 100 24v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
        </svg>
        Se connecter
      </button>
    </form>

    <p class="text-center text-sm text-muted-foreground">
      <RouterLink to="/mot-de-passe-oublie" class="font-medium text-primary transition-colors hover:text-primary/80">
        Mot de passe oublié ?
      </RouterLink>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '@/store';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const form = reactive({
  email: '',
  password: '',
});

const isSubmitting = ref(false);
const errorMessage = ref('');

const canSubmit = computed(() => {
  return Boolean(form.email.trim()) && Boolean(form.password.trim()) && !isSubmitting.value;
});

async function handleSubmit() {
  if (!canSubmit.value) {
    return;
  }

  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    await authStore.login({ email: form.email.trim(), password: form.password });
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Connexion impossible.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>
