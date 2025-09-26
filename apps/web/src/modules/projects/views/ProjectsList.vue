<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <BaseBadge variant="accent">Projets &amp; Analytique</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Pilotez vos projets avec une visibilité budgétaire claire
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Analysez l'avancement des budgets, identifiez les écarts et anticipez vos prochaines échéances pour sécuriser les
        financements.
      </p>
    </header>

    <BaseCard>
      <template #title>Vue d'ensemble</template>
      <template #description>
        Synthèse budget vs réalisé pour les {{ filterLabel.toLowerCase() }} de l'organisation.
      </template>
      <div class="space-y-6">
        <VarianceBar v-if="totals" :planned="totals.planned" :actual="totals.actualNet" :currency="currency" />
        <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Budget planifié</dt>
            <dd class="text-lg font-semibold text-foreground">{{ formatCurrency(totals?.planned ?? 0, currency) }}</dd>
          </div>
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Réalisé</dt>
            <dd class="text-lg font-semibold text-foreground">{{ formatCurrency(totals?.actualNet ?? 0, currency) }}</dd>
          </div>
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Charges engagées</dt>
            <dd class="text-lg font-semibold text-foreground">{{ formatCurrency(totals?.actualDebit ?? 0, currency) }}</dd>
          </div>
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Écart</dt>
            <dd :class="varianceTextClass(totals?.variance ?? 0)" class="text-lg font-semibold">
              {{ formatCurrency(totals?.variance ?? 0, currency) }}
            </dd>
          </div>
        </dl>
        <p v-if="lastUpdated" class="text-xs text-muted-foreground">
          Dernière actualisation : {{ formatDateTime(lastUpdated) }}
        </p>
      </div>
    </BaseCard>

    <div class="space-y-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <BaseButton
            v-for="filter in typeFilters"
            :key="filter.value"
            variant="outline"
            size="sm"
            :class="[
              'rounded-full border-2',
              selectedType === filter.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-transparent bg-muted/60 text-muted-foreground hover:text-primary',
            ]"
            @click="selectType(filter.value)"
          >
            {{ filter.label }}
          </BaseButton>
        </div>
        <span v-if="!organizationId" class="text-sm text-muted-foreground">
          Sélectionnez une organisation pour afficher les projets.
        </span>
      </div>

      <div v-if="error" class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="!organizationId" class="rounded-xl border border-outline/50 bg-muted/20 p-6 text-sm text-muted-foreground">
        Connectez-vous à une organisation pour accéder aux suivis budgétaires.
      </div>

      <div v-else-if="isLoading" class="space-y-3">
        <div class="h-4 w-32 animate-pulse rounded bg-muted/40"></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="h-48 animate-pulse rounded-2xl bg-muted/30"></div>
          <div class="h-48 animate-pulse rounded-2xl bg-muted/30"></div>
        </div>
      </div>

      <div v-else-if="projects.length === 0" class="rounded-xl border border-outline/60 bg-muted/20 p-6 text-sm text-muted-foreground">
        Aucun projet trouvé pour cette catégorie. Créez un projet pour commencer le suivi budgétaire.
      </div>

      <div v-else class="grid gap-6 lg:grid-cols-2">
        <article
          v-for="project in projects"
          :key="project.id"
          class="flex flex-col gap-6 rounded-2xl border border-outline/60 bg-surface p-6 shadow-soft"
        >
          <header class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-xl font-semibold text-foreground">
                  {{ project.code }} · {{ project.name }}
                </h2>
                <p v-if="project.funder" class="text-sm text-muted-foreground">Financeur : {{ project.funder }}</p>
              </div>
              <BaseBadge variant="outline">
                {{ project.type === 'SUBSIDY' ? 'Subvention' : 'Projet' }}
              </BaseBadge>
            </div>
            <p v-if="project.description" class="text-sm text-muted-foreground">{{ project.description }}</p>
          </header>

          <VarianceBar
            :planned="project.plannedAmount"
            :actual="project.actual.net"
            :currency="project.currency"
          />

          <dl class="grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-xs uppercase tracking-wide text-muted-foreground">Budget</dt>
              <dd class="text-base font-medium text-foreground">
                {{ formatCurrency(project.plannedAmount, project.currency) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-muted-foreground">Réalisé</dt>
              <dd class="text-base font-medium text-foreground">
                {{ formatCurrency(project.actual.net, project.currency) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-muted-foreground">Écart</dt>
              <dd :class="varianceTextClass(project.variance)" class="text-base font-semibold">
                {{ formatCurrency(project.variance, project.currency) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-muted-foreground">Prochaine échéance</dt>
              <dd class="text-base font-medium text-foreground">
                {{ formatDate(nextDeadline(project)) }}
              </dd>
            </div>
          </dl>

          <div v-if="project.periods.length" class="space-y-3 rounded-xl border border-outline/40 bg-muted/20 p-4">
            <h3 class="text-sm font-semibold text-foreground">Périodes suivies</h3>
            <ul class="space-y-3 text-sm">
              <li
                v-for="period in project.periods"
                :key="period.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 shadow-soft"
              >
                <div class="flex flex-col">
                  <span class="font-medium text-foreground">{{ period.label }}</span>
                  <span class="text-xs text-muted-foreground">
                    {{ formatDate(period.startDate) }} → {{ formatDate(period.endDate) }}
                  </span>
                </div>
                <div class="text-right">
                  <p class="text-xs text-muted-foreground">Budget</p>
                  <p class="font-medium text-foreground">
                    {{ formatCurrency(period.plannedAmount, project.currency) }}
                  </p>
                  <p class="text-xs text-muted-foreground">Réalisé</p>
                  <p class="font-medium text-foreground">
                    {{ formatCurrency(period.actual.net, project.currency) }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import VarianceBar from '@/components/charts/VarianceBar.vue';
import { apiFetchJson } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/store';

type ProjectType = 'PROJECT' | 'SUBSIDY';

type AmountSummary = {
  debit: number;
  credit: number;
  net: number;
};

type ProjectPeriodSummary = {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  plannedAmount: number;
  actual: AmountSummary;
  variance: number;
};

type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: ProjectType;
  funder: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  plannedAmount: number;
  actual: AmountSummary;
  variance: number;
  periods: ProjectPeriodSummary[];
};

type ProjectTotals = {
  planned: number;
  actualDebit: number;
  actualCredit: number;
  actualNet: number;
  variance: number;
};

type ProjectListResponse = {
  data: ProjectSummary[];
  totals: ProjectTotals;
};

const typeFilters = [
  { label: 'Tous les projets', value: 'ALL' as const },
  { label: 'Projets opérationnels', value: 'PROJECT' as const },
  { label: 'Subventions', value: 'SUBSIDY' as const },
];

type FilterValue = (typeof typeFilters)[number]['value'];

const authStore = useAuthStore();
const organizationId = computed(() => authStore.organizationId);
const selectedType = ref<FilterValue>('ALL');
const projects = ref<ProjectSummary[]>([]);
const totals = ref<ProjectTotals | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<string | null>(null);

const currency = computed(() => projects.value[0]?.currency ?? 'EUR');
const filterLabel = computed(() => typeFilters.find((filter) => filter.value === selectedType.value)?.label ?? 'projets');

function selectType(value: FilterValue) {
  if (selectedType.value !== value) {
    selectedType.value = value;
  }
}

watch(
  () => [organizationId.value, selectedType.value],
  async ([orgId]) => {
    if (orgId) {
      await fetchProjects();
    } else {
      projects.value = [];
      totals.value = null;
    }
  },
  { immediate: true },
);

async function fetchProjects() {
  if (!organizationId.value) {
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const params = new URLSearchParams();
    if (selectedType.value !== 'ALL') {
      params.set('type', selectedType.value);
    }

    const response = await apiFetchJson<ProjectListResponse>(
      `/api/v1/orgs/${organizationId.value}/projects${params.size ? `?${params.toString()}` : ''}`,
    );

    projects.value = response.data;
    totals.value = response.totals;
    lastUpdated.value = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Impossible de charger les projets.";
    error.value = message;
  } finally {
    isLoading.value = false;
  }
}

function nextDeadline(project: ProjectSummary): string | null {
  const today = Date.now();
  const candidates = project.periods
    .map((period) => period.endDate)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .filter((date) => date.getTime() >= today)
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates.length > 0) {
    return candidates[0]?.toISOString() ?? null;
  }

  return project.endDate;
}

function varianceTextClass(value: number): string {
  if (value > 0) {
    return 'text-destructive';
  }
  if (value < 0) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return 'text-foreground';
}
</script>
