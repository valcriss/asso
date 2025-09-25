<template>
  <span
    :class="[
      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
      badgeClasses,
    ]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'accent' | 'secondary';
  }>(),
  {
    variant: 'primary',
  },
);

const badgeClasses = computed(() => {
  switch (props.variant) {
    case 'accent':
      return 'bg-accent/20 text-accent border border-accent/30';
    case 'secondary':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-primary/15 text-primary';
  }
});
</script>
