<template>
  <nav class="flex flex-wrap gap-4 text-xs">
    <RouterLink
      :to="{ name: 'legal.terms' }"
      class="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('app.footer.links.terms') }}
    </RouterLink>
    <RouterLink
      :to="{ name: 'legal.privacy' }"
      class="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('app.footer.links.privacy') }}
    </RouterLink>
    <RouterLink
      :to="{ name: 'legal.dpa' }"
      class="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('app.footer.links.dpa') }}
    </RouterLink>
    <a
      class="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      href="mailto:support@asso.example"
    >
      {{ t('app.footer.links.support') }}
    </a>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const { t } = useI18n();
</script>
