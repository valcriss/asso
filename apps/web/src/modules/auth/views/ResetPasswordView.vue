<template>
  <section class="space-y-8">
    <header class="space-y-2 text-center">
      <h1 class="text-3xl font-display font-semibold text-foreground">Réinitialiser le mot de passe</h1>
      <p class="text-sm text-muted-foreground">
        Choisissez un nouveau mot de passe pour sécuriser votre compte.
      </p>
    </header>

    <div v-if="!token" class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      Le lien de réinitialisation est invalide ou expiré. Veuillez refaire une demande.
    </div>

    <form v-else class="space-y-5" @submit.prevent="handleSubmit" novalidate>
      <div class="space-y-1">
        <label for="password" class="text-sm font-medium text-foreground">Nouveau mot de passe</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          class="w-full rounded-xl border border-outline/60 bg-background px-4 py-3 text-sm text-foreground shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div class="space-y-1">
        <label for="confirm-password" class="text-sm font-medium text-foreground">Confirmer le mot de passe</label>
        <input
          id="confirm-password"
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
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
        Mettre à jour le mot de passe
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
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

type Props = {
  token?: string;
};

const props = defineProps<Props>();

const password = ref('');
const confirmation = ref('');
const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const canSubmit = computed(() => {
  return (
    Boolean(props.token) &&
    Boolean(password.value.trim()) &&
    password.value.trim().length >= 8 &&
    password.value === confirmation.value &&
    !isSubmitting.value
  );
});

watch(
  () => [password.value, confirmation.value],
  () => {
    if (password.value && confirmation.value && password.value !== confirmation.value) {
      errorMessage.value = 'Les mots de passe doivent être identiques.';
    } else {
      errorMessage.value = '';
    }
  },
);

async function handleSubmit() {
  if (!canSubmit.value || !props.token) {
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const response = await fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: props.token, password: password.value }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const detail = data?.detail ?? data?.message;
      throw new Error(detail ?? 'Impossible de mettre à jour le mot de passe.');
    }

    successMessage.value = 'Votre mot de passe a été mis à jour avec succès.';
    password.value = '';
    confirmation.value = '';
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Impossible de mettre à jour le mot de passe.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>
