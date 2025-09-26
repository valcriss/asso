<template>
  <component :is="layoutComponent">
    <RouterView />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import AuthLayout from './layouts/AuthLayout.vue';
import MainLayout from './layouts/MainLayout.vue';
import PublicLayout from './layouts/PublicLayout.vue';

const route = useRoute();

const layoutComponent = computed(() => {
  const layout = route.meta.layout;
  if (layout === 'auth') {
    return AuthLayout;
  }
  if (layout === 'public') {
    return PublicLayout;
  }
  return MainLayout;
});
</script>
