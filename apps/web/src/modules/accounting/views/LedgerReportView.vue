<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground">Grand livre</h1>
      <p class="text-sm text-muted-foreground">
        Visualisez les mouvements de chaque compte avec leur solde courant et exportez le rapport pour vos contrôles.
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
      <template #title>Comptes</template>
      <template #description>
        {{ report ? `${report.accounts.length} comptes mouvementés` : 'Chargement...' }}
      </template>

      <div v-if="error" class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="!report" class="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Chargement du grand livre…
      </div>

      <div v-else class="space-y-6">
        <details
          v-for="account in report.accounts"
          :key="account.accountId"
          class="rounded-xl border border-outline/60 bg-background"
          open
        >
          <summary class="flex cursor-pointer items-center justify-between px-4 py-3 text-sm">
            <span class="font-semibold text-foreground">
              {{ account.code }} — {{ account.name }}
            </span>
            <span class="text-muted-foreground">
              Solde {{ account.balance.toFixed(2) }} € (Débit {{ account.totalDebit.toFixed(2) }} € / Crédit
              {{ account.totalCredit.toFixed(2) }} €)
            </span>
          </summary>
          <div class="overflow-x-auto px-4 pb-4">
            <table class="min-w-full divide-y divide-outline text-sm">
              <thead class="bg-muted/40">
                <tr>
                  <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
                  <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Journal</th>
                  <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Référence</th>
                  <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Libellé</th>
                  <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Débit</th>
                  <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Crédit</th>
                  <th class="px-3 py-2 text-right font-semibold text-muted-foreground">Solde</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline/60">
                <tr v-for="movement in account.movements" :key="movement.lineId">
                  <td class="px-3 py-2 text-foreground">{{ movement.date }}</td>
                  <td class="px-3 py-2 text-foreground">{{ movement.journalCode }} — {{ movement.journalName }}</td>
                  <td class="px-3 py-2 text-foreground">{{ movement.reference ?? '—' }}</td>
                  <td class="px-3 py-2 text-foreground">{{ movement.memo ?? '—' }}</td>
                  <td class="px-3 py-2 text-right text-foreground">{{ movement.debit.toFixed(2) }}</td>
                  <td class="px-3 py-2 text-right text-foreground">{{ movement.credit.toFixed(2) }}</td>
                  <td class="px-3 py-2 text-right text-foreground">{{ movement.balance.toFixed(2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

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

interface LedgerMovement {
  lineId: string;
  date: string;
  journalCode: string;
  journalName: string;
  reference: string | null;
  memo: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerAccount {
  accountId: string;
  code: string;
  name: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  movements: LedgerMovement[];
}

interface LedgerReport {
  accounts: LedgerAccount[];
  totals: { debit: number; credit: number };
}

const authStore = useAuthStore();
const organizationId = computed(() => authStore.organizationId ?? 'demo-org');

const fiscalYears = ref<FiscalYearOption[]>([]);
const selectedFiscalYearId = ref('');
const report = ref<LedgerReport | null>(null);
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
    `/api/v1/orgs/${organizationId.value}/reports/ledger?fiscalYearId=${encodeURIComponent(fiscalYearId)}`,
    {
      headers: authStore.authorizationHeader ?? {},
    }
  );
  if (!response.ok) {
    error.value = 'Le grand livre n\'a pas pu être chargé.';
    return;
  }
  const payload = (await response.json()) as { data: LedgerReport };
  report.value = payload.data;
}

async function downloadReport(format: 'csv' | 'pdf') {
  if (!selectedFiscalYearId.value) {
    return;
  }
  const response = await fetch(
    `/api/v1/orgs/${organizationId.value}/reports/ledger?fiscalYearId=${encodeURIComponent(
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
  link.download = `grand-livre-${selectedFiscalYearId.value}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
</script>
