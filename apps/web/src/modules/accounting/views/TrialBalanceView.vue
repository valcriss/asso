<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground">Balance comptable</h1>
      <p class="text-sm text-muted-foreground">
        Analysez les soldes par compte et exportez la balance en CSV ou PDF pour vos contrôles périodiques.
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
      <template #title>Balance</template>
      <template #description>
        {{ report ? `${report.lines.length} comptes` : 'Chargement...' }}
      </template>

      <div v-if="error" class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="!report" class="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Chargement de la balance…
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-outline text-sm">
          <thead class="bg-muted/40">
            <tr>
              <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Code</th>
              <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Libellé</th>
              <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Type</th>
              <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Débit</th>
              <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Crédit</th>
              <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Solde</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline/60">
            <tr v-for="line in report.lines" :key="line.accountId">
              <td class="px-3 py-2 text-foreground">{{ line.code }}</td>
              <td class="px-3 py-2 text-foreground">{{ line.name }}</td>
              <td class="px-3 py-2 text-foreground">{{ line.type }}</td>
              <td class="px-3 py-2 text-right text-foreground">{{ formatCurrency(line.debit) }}</td>
              <td class="px-3 py-2 text-right text-foreground">{{ formatCurrency(line.credit) }}</td>
              <td class="px-3 py-2 text-right text-foreground">{{ formatCurrency(line.balance) }}</td>
            </tr>
          </tbody>
          <tfoot class="bg-muted/20">
            <tr>
              <td colspan="3" class="px-3 py-2 text-right font-semibold text-foreground">Totaux</td>
              <td class="px-3 py-2 text-right font-semibold text-foreground">{{ formatCurrency(report.totals.debit) }}</td>
              <td class="px-3 py-2 text-right font-semibold text-foreground">{{ formatCurrency(report.totals.credit) }}</td>
              <td class="px-3 py-2 text-right font-semibold text-foreground">{{ formatCurrency(report.totals.balance) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </BaseCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import { useLocaleFormatting } from '@/composables/useLocaleFormatting';
import { useAuthStore } from '@/store';

interface FiscalYearOption {
  id: string;
  label: string;
  status: 'OPEN' | 'LOCKED';
}

interface TrialBalanceLine {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalanceReport {
  lines: TrialBalanceLine[];
  totals: { debit: number; credit: number; balance: number };
}

const authStore = useAuthStore();
const { formatCurrency } = useLocaleFormatting();
const organizationId = computed(() => authStore.organizationId ?? 'demo-org');

const fiscalYears = ref<FiscalYearOption[]>([]);
const selectedFiscalYearId = ref('');
const report = ref<TrialBalanceReport | null>(null);
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
    `/api/v1/orgs/${organizationId.value}/reports/balance?fiscalYearId=${encodeURIComponent(fiscalYearId)}`,
    {
      headers: authStore.authorizationHeader ?? {},
    }
  );
  if (!response.ok) {
    error.value = 'La balance n\'a pas pu être chargée.';
    return;
  }
  const payload = (await response.json()) as { data: TrialBalanceReport };
  report.value = payload.data;
}

async function downloadReport(format: 'csv' | 'pdf') {
  if (!selectedFiscalYearId.value) {
    return;
  }
  const response = await fetch(
    `/api/v1/orgs/${organizationId.value}/reports/balance?fiscalYearId=${encodeURIComponent(
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
  link.download = `balance-${selectedFiscalYearId.value}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
</script>
