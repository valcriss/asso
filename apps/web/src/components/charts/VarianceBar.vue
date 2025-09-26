<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between text-xs text-muted-foreground">
      <span>Budget</span>
      <span>{{ plannedLabel }}</span>
    </div>
    <div class="relative h-3 overflow-hidden rounded-full bg-muted/50">
      <div class="absolute inset-y-0 left-0 rounded-full bg-muted/80" :style="{ width: `${plannedWidth}%` }"></div>
      <div
        class="absolute inset-y-0 left-0 rounded-full transition-all"
        :class="actual > planned ? 'bg-destructive' : 'bg-primary'"
        :style="{ width: `${actualWidth}%` }"
      ></div>
    </div>
    <div class="flex items-center justify-between text-xs text-muted-foreground">
      <span>Réalisé</span>
      <span :class="actual > planned ? 'text-destructive' : 'text-foreground'">{{ actualLabel }}</span>
    </div>
    <div class="flex items-center justify-between text-xs">
      <span class="text-muted-foreground">Écart</span>
      <span :class="varianceClass">{{ varianceLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { formatCurrency } from '@/lib/format';

interface Props {
  planned: number;
  actual: number;
  currency?: string;
}

const props = defineProps<Props>();

const plannedLabel = computed(() => formatCurrency(props.planned, props.currency));
const actualLabel = computed(() => formatCurrency(props.actual, props.currency));
const variance = computed(() => props.actual - props.planned);
const varianceLabel = computed(() => formatCurrency(variance.value, props.currency));
const varianceClass = computed(() =>
  variance.value > 0
    ? 'text-destructive font-semibold'
    : 'text-emerald-600 font-semibold dark:text-emerald-400'
);

const maxValue = computed(() => Math.max(props.planned, props.actual, 1));
const plannedWidth = computed(() => Math.max(Math.min((props.planned / maxValue.value) * 100, 100), props.planned > 0 ? 4 : 0));
const actualWidth = computed(() => Math.max(Math.min((props.actual / maxValue.value) * 100, 100), props.actual > 0 ? 4 : 0));
</script>
