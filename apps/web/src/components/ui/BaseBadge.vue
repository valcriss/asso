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
    variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'success';
  }>(),
  {
    variant: 'primary',
  },
);

const badgeClasses = computed(() => {
  switch (props.variant) {
    case 'accent':
      return 'bg-accent text-accent-foreground border border-accent/60';
    case 'secondary':
      return 'bg-secondary text-secondary-foreground';
    case 'outline':
      return 'border border-outline/50 bg-background text-foreground';
    case 'success':
      return 'border border-emerald-200 bg-emerald-100 text-emerald-700';
    default:
      return 'bg-primary/15 text-primary';
  }
});
</script>
