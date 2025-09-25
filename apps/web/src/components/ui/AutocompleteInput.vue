<template>
  <div class="space-y-2">
    <label v-if="label" :for="inputId" class="text-sm font-medium text-foreground">
      {{ label }}
    </label>
    <div class="relative">
      <input
        :id="inputId"
        v-model="searchTerm"
        type="text"
        class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        :placeholder="placeholder"
        @focus="open = true"
        @blur="handleBlur"
        @keydown.down.prevent="highlightNext"
        @keydown.up.prevent="highlightPrevious"
        @keydown.enter.prevent="selectHighlighted"
      />
      <ul
        v-if="open && filteredItems.length"
        class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-outline bg-background shadow-lg"
      >
        <li
          v-for="(item, index) in filteredItems"
          :key="item.id"
          class="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
          :class="{ 'bg-muted': index === highlightedIndex }"
          @mousedown.prevent="selectItem(item)"
        >
          <div class="font-medium">{{ item.label }}</div>
          <div v-if="item.description" class="text-xs text-muted-foreground">{{ item.description }}</div>
        </li>
      </ul>
    </div>
    <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface AutocompleteItem {
  id: string;
  label: string;
  description?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    items?: AutocompleteItem[];
    label?: string;
    placeholder?: string;
    hint?: string;
    id?: string;
  }>(),
  {
    modelValue: null,
    items: () => [],
    label: undefined,
    placeholder: undefined,
    hint: undefined,
    id: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const searchTerm = ref('');
const open = ref(false);
const highlightedIndex = ref(-1);

const inputId = computed(() => props.id ?? `autocomplete-${Math.random().toString(16).slice(2)}`);

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      searchTerm.value = '';
      return;
    }
    const items = props.items ?? [];
    const match = items.find((item) => item.id === value);
    if (match) {
      searchTerm.value = match.label;
    }
  },
  { immediate: true },
);

const filteredItems = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const items = props.items ?? [];
  if (!query) {
    return items.slice(0, 20);
  }
  return items
    .filter((item) => {
      const label = item.label.toLowerCase();
      const description = item.description?.toLowerCase() ?? '';
      return label.includes(query) || description.includes(query);
    })
    .slice(0, 20);
});

function selectItem(item: AutocompleteItem) {
  searchTerm.value = item.label;
  emit('update:modelValue', item.id);
  open.value = false;
  highlightedIndex.value = -1;
}

function handleBlur() {
  setTimeout(() => {
    open.value = false;
  }, 50);

  const match = findMatch(searchTerm.value);
  if (match) {
    emit('update:modelValue', match.id);
    searchTerm.value = match.label;
  } else {
    emit('update:modelValue', null);
  }
}

function findMatch(value: string) {
  const normalized = value.trim().toLowerCase();
  const items = props.items ?? [];
  return items.find((item) => {
    if (!normalized) {
      return false;
    }
    if (item.id === value) {
      return true;
    }
    const label = item.label.toLowerCase();
    const description = item.description?.toLowerCase() ?? '';
    return label === normalized || description === normalized;
  });
}

function highlightNext() {
  open.value = true;
  if (!filteredItems.value.length) {
    return;
  }
  highlightedIndex.value = (highlightedIndex.value + 1) % filteredItems.value.length;
}

function highlightPrevious() {
  open.value = true;
  if (!filteredItems.value.length) {
    return;
  }
  highlightedIndex.value =
    highlightedIndex.value <= 0
      ? filteredItems.value.length - 1
      : highlightedIndex.value - 1;
}

function selectHighlighted() {
  if (highlightedIndex.value < 0 || highlightedIndex.value >= filteredItems.value.length) {
    const match = findMatch(searchTerm.value);
    if (match) {
      selectItem(match);
    }
    return;
  }
  const item = filteredItems.value[highlightedIndex.value];
  if (item) {
    selectItem(item);
  }
}
</script>
