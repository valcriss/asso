<template>
  <button
    :class="[
      'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
      sizeClasses,
      buttonClasses,
    ]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
    size?: 'sm' | 'md';
  }>(),
  {
    variant: 'primary',
    size: 'md',
  },
);

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'rounded-md px-3 py-1.5 text-xs';
    default:
      return 'rounded-lg px-4 py-2 text-sm';
  }
});

const buttonClasses = computed(() => {
  switch (props.variant) {
    case 'secondary':
      return 'bg-secondary text-secondary-foreground hover:bg-secondary/90 focus-visible:ring-secondary/50';
    case 'ghost':
      return 'bg-transparent text-muted-foreground hover:bg-muted/60 focus-visible:ring-muted/60';
    case 'outline':
      return 'border border-outline bg-background text-foreground hover:bg-muted/60 focus-visible:ring-outline';
    default:
      return 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 focus-visible:ring-primary/60';
  }
});
</script>
