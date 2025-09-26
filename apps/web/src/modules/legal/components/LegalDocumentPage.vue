<template>
  <article class="flex flex-col gap-8" aria-labelledby="document-title">
    <header class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h1 id="document-title" class="text-3xl font-semibold text-foreground">
          {{ title }}
        </h1>
        <p class="text-base text-muted-foreground">
          {{ description }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ lastUpdated }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <BaseButton :disabled="isExporting" @click="exportPdf">
          <span
            v-if="isExporting"
            class="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
          ></span>
          <span>{{ t('legal.actions.downloadPdf') }}</span>
        </BaseButton>
      </div>
      <nav
        class="rounded-xl border border-outline/40 bg-muted/40 p-4 text-sm"
        :aria-label="t('legal.common.tableOfContents')"
      >
        <p class="mb-3 font-semibold uppercase tracking-wide text-muted-foreground">
          {{ t('legal.common.tableOfContents') }}
        </p>
        <ul class="flex flex-col gap-2">
          <li v-for="section in sections" :key="section.id">
            <a
              class="text-primary transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :href="`#${section.id}`"
            >
              {{ section.title }}
            </a>
          </li>
        </ul>
      </nav>
    </header>

    <section
      v-for="section in sections"
      :key="section.id"
      :id="section.id"
      class="scroll-mt-24 border-t border-outline/20 pt-8"
    >
      <h2 class="text-2xl font-semibold text-foreground">
        {{ section.title }}
      </h2>
      <div class="mt-4 flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
        <p v-for="(paragraph, index) in section.paragraphs" :key="`${section.id}-${index}`">
          {{ paragraph }}
        </p>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import BaseButton from '@/components/ui/BaseButton.vue';

export interface LegalDocumentSection {
  id: string;
  title: string;
  paragraphs: string[];
}

const props = defineProps<{
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalDocumentSection[];
  filename: string;
}>();

const { t } = useI18n();
const isExporting = ref(false);

async function exportPdf() {
  try {
    isExporting.value = true;
    const { exportLegalDocumentToPdf } = await import('../utils/pdf');
    await exportLegalDocumentToPdf({
      title: props.title,
      description: props.description,
      lastUpdated: props.lastUpdated,
      sections: props.sections,
      fileName: props.filename,
    });
  } finally {
    isExporting.value = false;
  }
}
</script>
