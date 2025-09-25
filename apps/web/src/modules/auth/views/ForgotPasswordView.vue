<template>
  <section class="space-y-8">
    <header class="space-y-2 text-center">
      <h1 class="text-3xl font-display font-semibold text-foreground">Mot de passe oublié</h1>
      <p class="text-sm text-muted-foreground">
        Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.
      </p>
    </header>

    <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
      <div class="space-y-1">
        <label for="forgot-email" class="text-sm font-medium text-foreground">Adresse e-mail</label>
        <input
          id="forgot-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full rounded-xl border border-outline/60 bg-background px-4 py-3 text-sm text-foreground shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <p v-if="errorMessage" class="text-sm text-destructive" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="text-sm text-primary" role="status">{{ successMessage }}</p>

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
        Envoyer le lien
      </button>
    </form>

    <p class="text-center text-sm text-muted-foreground">
      <RouterLink to="/connexion" class="font-medium text-primary transition-colors hover:text-primary/80">
        Retour à la connexion
      </RouterLink>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

const email = ref('');
const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const canSubmit = computed(() => Boolean(email.value.trim()) && !isSubmitting.value);

async function handleSubmit() {
  if (!canSubmit.value) {
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const response = await fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.value.trim() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const detail = data?.detail ?? data?.message;
      throw new Error(detail ?? 'Impossible d\'envoyer le lien.');
    }

    successMessage.value =
      'Si cette adresse est enregistrée, un lien de réinitialisation vient de vous être envoyé.';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossible d\'envoyer le lien.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>
