<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <BaseBadge variant="accent">Subventions</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Assurez le suivi des engagements et des justificatifs de vos financeurs
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Visualisez les montants engagés, préparez vos dossiers justificatifs et anticipez les dates d'échéance pour rester en
        conformité avec les financeurs.
      </p>
    </header>

    <BaseCard>
      <template #title>Vue d'ensemble</template>
      <template #description>Suivi budgétaire global des subventions actives.</template>
      <div class="space-y-6">
        <VarianceBar v-if="totals" :planned="totals.planned" :actual="totals.actualNet" :currency="currency" />
        <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Montant accordé</dt>
            <dd class="text-lg font-semibold text-foreground">{{ formatCurrency(totals?.planned ?? 0, currency) }}</dd>
          </div>
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Dépenses reconnues</dt>
            <dd class="text-lg font-semibold text-foreground">{{ formatCurrency(totals?.actualDebit ?? 0, currency) }}</dd>
          </div>
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Recettes imputées</dt>
            <dd class="text-lg font-semibold text-foreground">{{ formatCurrency(totals?.actualCredit ?? 0, currency) }}</dd>
          </div>
          <div class="space-y-1 rounded-xl bg-muted/40 p-4">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">Écart global</dt>
            <dd :class="varianceTextClass(totals?.variance ?? 0)" class="text-lg font-semibold">
              {{ formatCurrency(totals?.variance ?? 0, currency) }}
            </dd>
          </div>
        </dl>
      </div>
    </BaseCard>

    <div class="grid gap-6 xl:grid-cols-[2fr,1fr]">
      <div class="space-y-4">
        <div v-if="error" class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {{ error }}
        </div>

        <div
          v-else-if="!organizationId"
          class="rounded-xl border border-outline/60 bg-muted/20 p-6 text-sm text-muted-foreground"
        >
          Connectez-vous à une organisation pour accéder au suivi des subventions.
        </div>

        <div v-else-if="isLoading" class="space-y-3">
          <div class="h-4 w-40 animate-pulse rounded bg-muted/40"></div>
          <div class="h-52 animate-pulse rounded-2xl bg-muted/30"></div>
        </div>

        <div v-else-if="subsidies.length === 0" class="rounded-xl border border-outline/60 bg-muted/20 p-6 text-sm text-muted-foreground">
          Aucune subvention enregistrée pour l'instant. Créez un projet de type subvention pour débuter le suivi analytique.
        </div>

        <div v-else class="overflow-hidden rounded-2xl border border-outline/60 bg-surface shadow-soft">
          <table class="min-w-full divide-y divide-outline/50 text-sm">
            <thead class="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th class="px-4 py-3 font-medium">Subvention</th>
                <th class="px-4 py-3 font-medium">Financeur</th>
                <th class="px-4 py-3 font-medium text-right">Budget</th>
                <th class="px-4 py-3 font-medium text-right">Réalisé</th>
                <th class="px-4 py-3 font-medium text-right">Écart</th>
                <th class="px-4 py-3 font-medium">Échéance</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline/30">
              <tr v-for="project in subsidies" :key="project.id" class="transition-colors hover:bg-muted/20">
                <td class="px-4 py-3">
                  <div class="flex flex-col">
                    <span class="font-medium text-foreground">{{ project.code }} · {{ project.name }}</span>
                    <span v-if="project.description" class="text-xs text-muted-foreground">{{ project.description }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-muted-foreground">{{ project.funder ?? '—' }}</td>
                <td class="px-4 py-3 text-right font-medium text-foreground">
                  {{ formatCurrency(project.plannedAmount, project.currency) }}
                </td>
                <td class="px-4 py-3 text-right font-medium text-foreground">
                  {{ formatCurrency(project.actual.net, project.currency) }}
                </td>
                <td class="px-4 py-3 text-right font-semibold" :class="varianceTextClass(project.variance)">
                  {{ formatCurrency(project.variance, project.currency) }}
                </td>
                <td class="px-4 py-3 text-sm text-muted-foreground">
                  {{ formatDate(nextDeadline(project)) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <BaseButton
                    size="sm"
                    variant="outline"
                    :disabled="exportingProjectId === project.id"
                    @click="downloadJustification(project)"
                  >
                    Export justificatif
                  </BaseButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="exportError" class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {{ exportError }}
        </div>
      </div>

      <aside class="space-y-4">
        <BaseCard>
          <template #title>Échéances à venir</template>
          <template #description>
            Priorisez la collecte des justificatifs en suivant les jalons les plus proches.
          </template>
          <ul v-if="upcomingDeadlines.length" class="space-y-3 text-sm">
            <li
              v-for="deadline in upcomingDeadlines"
              :key="`${deadline.project.id}-${deadline.period?.id ?? 'global'}`"
              class="rounded-xl bg-muted/20 p-3"
            >
              <p class="font-medium text-foreground">{{ deadline.project.name }}</p>
              <p class="text-xs text-muted-foreground">
                {{ deadline.period ? deadline.period.label : 'Synthèse annuelle' }} · Échéance {{ formatDate(deadline.date) }}
              </p>
              <p class="text-xs text-muted-foreground">
                Reliquat :
                <span :class="varianceTextClass(deadline.remaining)">
                  {{ formatCurrency(deadline.remaining, deadline.project.currency) }}
                </span>
              </p>
              <div class="mt-2">
                <BaseButton
                  size="sm"
                  variant="ghost"
                  class="px-0 text-xs font-medium text-primary"
                  :disabled="exportingProjectId === deadline.project.id"
                  @click="downloadJustification(deadline.project, deadline.period?.id)"
                >
                  Exporter la période
                </BaseButton>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">Aucune échéance à venir dans les 90 prochains jours.</p>
        </BaseCard>

        <BaseCard>
          <template #title>Conditions &amp; pièces attendues</template>
          <template #description>
            Centralisez les exigences des financeurs pour sécuriser vos versements.
          </template>
          <ul v-if="conditions.length" class="space-y-3 text-sm">
            <li v-for="condition in conditions" :key="condition.id" class="rounded-xl bg-muted/20 p-3">
              <p class="font-medium text-foreground">{{ condition.title }}</p>
              <p class="text-xs text-muted-foreground">{{ condition.details }}</p>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">
            Ajoutez des descriptions dans vos subventions pour récapituler les conditions d'usage et pièces justificatives.
          </p>
        </BaseCard>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import VarianceBar from '@/components/charts/VarianceBar.vue';
import { apiFetchJson, apiRequest } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
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

const authStore = useAuthStore();
const organizationId = computed(() => authStore.organizationId);

const subsidies = ref<ProjectSummary[]>([]);
const totals = ref<ProjectTotals | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const exportError = ref<string | null>(null);
const exportingProjectId = ref<string | null>(null);

const currency = computed(() => subsidies.value[0]?.currency ?? 'EUR');

watch(
  () => organizationId.value,
  async (orgId) => {
    if (!orgId) {
      subsidies.value = [];
      totals.value = null;
      return;
    }

    await fetchSubsidies();
  },
  { immediate: true },
);

async function fetchSubsidies() {
  if (!organizationId.value) {
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const response = await apiFetchJson<ProjectListResponse>(
      `/api/v1/orgs/${organizationId.value}/projects?type=SUBSIDY`,
    );
    subsidies.value = response.data;
    totals.value = response.totals;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Impossible de charger les subventions.';
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

const upcomingDeadlines = computed(() => {
  const now = Date.now();
  const horizon = now + 90 * 24 * 60 * 60 * 1000;

  return subsidies.value
    .flatMap((project) => {
      const scopedPeriods = project.periods
        .filter((period) => period.endDate)
        .map((period) => ({ period, date: new Date(period.endDate as string) }))
        .filter(({ date }) => !Number.isNaN(date.getTime()) && date.getTime() >= now && date.getTime() <= horizon)
        .map(({ period, date }) => ({
          project,
          period,
          date: date.toISOString(),
          remaining: project.plannedAmount - project.actual.net,
        }));

      if (scopedPeriods.length === 0 && project.endDate) {
        const end = new Date(project.endDate);
        if (!Number.isNaN(end.getTime()) && end.getTime() >= now && end.getTime() <= horizon) {
          return [
            {
              project,
              period: null,
              date: end.toISOString(),
              remaining: project.plannedAmount - project.actual.net,
            },
          ];
        }
      }

      return scopedPeriods;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);
});

const conditions = computed(() =>
  subsidies.value
    .filter((project) => Boolean(project.description))
    .map((project) => ({
      id: project.id,
      title: project.name,
      details: project.description ?? '',
    })),
);

function varianceTextClass(value: number): string {
  if (value > 0) {
    return 'text-destructive';
  }
  if (value < 0) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return 'text-foreground';
}

async function downloadJustification(project: ProjectSummary, periodId?: string) {
  if (!organizationId.value) {
    return;
  }

  exportError.value = null;
  exportingProjectId.value = project.id;

  try {
    const params = new URLSearchParams();
    if (periodId) {
      params.set('periodId', periodId);
    }

    const response = await apiRequest(
      `/api/v1/orgs/${organizationId.value}/projects/${project.id}/export${params.size ? `?${params.toString()}` : ''}`,
      {
        headers: {
          Accept: 'text/csv',
        },
      },
    );

    if (!response.ok) {
      throw new Error(await readExportError(response));
    }

    const blob = await response.blob();
    const filename = extractFilename(response.headers.get('Content-Disposition')) ?? `${project.code}.csv`;
    triggerDownload(blob, filename);
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : 'Export impossible.';
  } finally {
    exportingProjectId.value = null;
  }
}

async function readExportError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
  } catch (error) {
    console.warn('Unable to parse export error response', error);
  }

  try {
    const text = await response.text();
    if (text) {
      return text;
    }
  } catch {
    // ignore
  }

  return 'Une erreur est survenue lors de la génération du justificatif.';
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>
