<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground">Journal comptable</h1>
      <p class="text-sm text-muted-foreground">
        Consultez toutes les écritures de l'exercice sélectionné, exportez-les en CSV ou PDF pour archivage ou audit.
      </p>
    </header>

    <BaseCard>
      <template #title>Filtres</template>
      <div class="flex flex-col gap-4 md:flex-row md:items-end">
        <div class="flex-1 space-y-2">
          <label for="fiscal-year" class="text-sm font-medium text-foreground">Exercice</label>
          <select
            id="fiscal-year"
            v-model="selectedFiscalYearId"
            class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option v-for="year in fiscalYears" :key="year.id" :value="year.id">
              {{ year.label }}
              <span v-if="year.status === 'LOCKED'"> (clos)</span>
            </option>
          </select>
        </div>
        <div class="flex gap-3">
          <BaseButton type="button" variant="outline" @click="downloadReport('csv')">Exporter CSV</BaseButton>
          <BaseButton type="button" variant="outline" @click="downloadReport('pdf')">Exporter PDF</BaseButton>
        </div>
      </div>
    </BaseCard>

    <BaseCard>
      <template #title>Écritures</template>
      <template #description>
        {{ report ? `${report.entries.length} écritures trouvées` : 'Chargement...' }}
      </template>

      <div v-if="error" class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="!report" class="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Chargement des écritures…
      </div>

      <div v-else class="space-y-6">
        <div v-for="entry in report.entries" :key="entry.entryId" class="rounded-xl border border-outline/60 p-4">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 class="text-base font-semibold text-foreground">
                {{ entry.date }} • {{ entry.journal.code }} — {{ entry.journal.name }}
              </h3>
              <p class="text-sm text-muted-foreground">
                Référence : {{ entry.reference ?? 'Non attribuée' }}
                <span v-if="entry.memo"> • {{ entry.memo }}</span>
              </p>
            </div>
            <div class="text-sm font-medium text-foreground">
              Total débit {{ entry.totals.debit.toFixed(2) }} € • Total crédit {{ entry.totals.credit.toFixed(2) }} €
            </div>
          </div>

          <div class="mt-4 overflow-x-auto">
            <table class="min-w-full divide-y divide-outline text-sm">
              <thead class="bg-muted/40">
                <tr>
                  <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Compte</th>
                  <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Débit</th>
                  <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Crédit</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline/60">
                <tr v-for="line in entry.lines" :key="line.lineId">
                  <td class="px-3 py-2 text-foreground">
                    <span class="font-medium">{{ line.accountCode }}</span>
                    <span class="text-sm text-muted-foreground"> — {{ line.accountName }}</span>
                  </td>
                  <td class="px-3 py-2 text-right text-foreground">{{ line.debit.toFixed(2) }}</td>
                  <td class="px-3 py-2 text-right text-foreground">{{ line.credit.toFixed(2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-xl border border-outline/60 bg-muted/20 p-4 text-sm font-semibold text-foreground">
          Totaux exercice — Débit : {{ report.totals.debit.toFixed(2) }} € • Crédit :
          {{ report.totals.credit.toFixed(2) }} €
        </div>
      </div>
    </BaseCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import { useAuthStore } from '@/store';

interface FiscalYearOption {
  id: string;
  label: string;
  status: 'OPEN' | 'LOCKED';
}

interface JournalReportLine {
  lineId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface JournalReportEntry {
  entryId: string;
  date: string;
  reference: string | null;
  memo: string | null;
  journal: { id: string; code: string; name: string };
  lines: JournalReportLine[];
  totals: { debit: number; credit: number };
}

interface JournalReport {
  fiscalYear: { id: string; label: string };
  entries: JournalReportEntry[];
  totals: { debit: number; credit: number };
}

const authStore = useAuthStore();
const organizationId = computed(() => authStore.organizationId ?? 'demo-org');

const fiscalYears = ref<FiscalYearOption[]>([]);
const selectedFiscalYearId = ref('');
const report = ref<JournalReport | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  await loadFiscalYears();
});

watch(selectedFiscalYearId, async (yearId) => {
  if (yearId) {
    await loadReport(yearId);
  }
});

async function loadFiscalYears() {
  const response = await fetch(`/api/v1/orgs/${organizationId.value}/accounting/dashboard`, {
    headers: authStore.authorizationHeader ?? {},
  });
  if (!response.ok) {
    error.value = 'Impossible de récupérer la liste des exercices.';
    return;
  }
  const payload = (await response.json()) as {
    data: { fiscalYears: FiscalYearOption[]; currentFiscalYear: FiscalYearOption | null };
  };
  fiscalYears.value = payload.data.fiscalYears;
  selectedFiscalYearId.value = payload.data.currentFiscalYear?.id ?? payload.data.fiscalYears[0]?.id ?? '';
}

async function loadReport(fiscalYearId: string) {
  report.value = null;
  error.value = null;
  const response = await fetch(
    `/api/v1/orgs/${organizationId.value}/reports/journal?fiscalYearId=${encodeURIComponent(fiscalYearId)}`,
    {
      headers: authStore.authorizationHeader ?? {},
    }
  );
  if (!response.ok) {
    error.value = "Le journal n'a pas pu être chargé.";
    return;
  }
  const payload = (await response.json()) as { data: JournalReport };
  report.value = payload.data;
}

async function downloadReport(format: 'csv' | 'pdf') {
  if (!selectedFiscalYearId.value) {
    return;
  }
  const response = await fetch(
    `/api/v1/orgs/${organizationId.value}/reports/journal?fiscalYearId=${encodeURIComponent(
      selectedFiscalYearId.value
    )}&format=${format}`,
    {
      headers: authStore.authorizationHeader ?? {},
    }
  );
  if (!response.ok) {
    error.value = "L'export a échoué.";
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const extension = format === 'csv' ? 'csv' : 'pdf';
  const link = document.createElement('a');
  link.href = url;
  link.download = `journal-${selectedFiscalYearId.value}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
</script>
