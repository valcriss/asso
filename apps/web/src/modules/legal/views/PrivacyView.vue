<template>
  <LegalDocumentPage
    :title="t('legal.privacy.title')"
    :description="t('legal.privacy.description')"
    :last-updated="lastUpdated"
    :sections="sections"
    :filename="t('legal.privacy.fileName')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import LegalDocumentPage, { type LegalDocumentSection } from '../components/LegalDocumentPage.vue';

type TranslatedSection = {
  title: string;
  content: Record<string, string>;
};

type TranslatedSections = Record<string, TranslatedSection>;

const { t, tm } = useI18n();

const sections = computed<LegalDocumentSection[]>(() => {
  const rawSections = tm('legal.privacy.sections') as unknown as TranslatedSections;
  return Object.entries(rawSections).map(([id, value]) => ({
    id,
    title: value.title,
    paragraphs: Object.values(value.content),
  }));
});

const lastUpdated = computed(() => t('legal.common.lastUpdated', { date: t('legal.privacy.updatedAt') }));
</script>
