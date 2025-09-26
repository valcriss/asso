<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground">Nouvelle écriture</h1>
      <p class="text-sm text-muted-foreground">
        Saisissez chaque ligne avec son compte comptable et un montant en débit ou crédit. Les montants sont validés en temps
        réel pour garantir l'équilibre de l'écriture.
      </p>
    </header>

    <form class="space-y-8" @submit.prevent="submitEntry">
      <BaseCard>
        <template #title>Informations générales</template>
        <template #description>
          Sélectionnez l'exercice, le journal et la date de comptabilisation avant d'ajouter les lignes de l'écriture.
        </template>
        <div class="grid gap-4 md:grid-cols-3">
          <div class="space-y-2">
            <label for="fiscal-year" class="text-sm font-medium text-foreground">Exercice</label>
            <select
              id="fiscal-year"
              v-model="form.fiscalYearId"
              class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option v-for="year in fiscalYears" :key="year.id" :value="year.id">
                {{ year.label }}
                <span v-if="year.status === 'LOCKED'"> (clos)</span>
              </option>
            </select>
          </div>
          <AutocompleteInput
            v-model="form.journalId"
            :items="journalOptions"
            label="Journal"
            placeholder="Rechercher par code ou libellé"
            hint="Seuls les journaux actifs sont proposés"
          />
          <div class="space-y-2">
            <label for="entry-date" class="text-sm font-medium text-foreground">Date</label>
            <input
              id="entry-date"
              v-model="form.date"
              type="date"
              class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              required
            />
          </div>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Lignes de l'écriture</template>
        <template #description>
          Chaque ligne doit contenir un compte et un montant unique (débit ou crédit). Ajoutez autant de lignes que nécessaire.
        </template>

        <div class="space-y-4">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-outline text-sm">
              <thead class="bg-muted/50">
                <tr>
                  <th scope="col" class="px-4 py-2 text-left font-semibold text-muted-foreground">Compte</th>
                  <th scope="col" class="px-4 py-2 text-left font-semibold text-muted-foreground">
                    Débit ({{ currency }})
                  </th>
                  <th scope="col" class="px-4 py-2 text-left font-semibold text-muted-foreground">
                    Crédit ({{ currency }})
                  </th>
                  <th scope="col" class="px-4 py-2" />
                </tr>
              </thead>
              <tbody class="divide-y divide-outline/60">
                <tr v-for="(line, index) in lines" :key="line.id">
                  <td class="px-4 py-3 align-top">
                    <AutocompleteInput
                      :id="`line-account-${line.id}`"
                      v-model="line.accountId"
                      :items="accountOptions"
                      placeholder="512000 — Banque"
                    />
                    <p v-for="error in lineErrors[index]" :key="error" class="mt-1 text-xs text-destructive">{{ error }}</p>
                  </td>
                  <td class="px-4 py-3 align-top">
                    <input
                      v-model="line.debit"
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </td>
                  <td class="px-4 py-3 align-top">
                    <input
                      v-model="line.credit"
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </td>
                  <td class="px-4 py-3 align-top">
                    <button
                      type="button"
                      class="text-xs font-medium text-destructive hover:underline"
                      :disabled="lines.length <= 2"
                      @click="removeLine(index)"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-muted/30 text-sm text-foreground">
                <tr>
                  <td class="px-4 py-2 font-semibold">Totaux</td>
                  <td class="px-4 py-2 font-semibold">{{ formatCurrency(totals.debit) }}</td>
                  <td class="px-4 py-2 font-semibold">{{ formatCurrency(totals.credit) }}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <BaseButton type="button" variant="outline" @click="addLine">Ajouter une ligne</BaseButton>
            <span v-if="totals.debit === totals.credit && totals.debit > 0" class="text-sm text-primary">
              L'écriture est équilibrée.
            </span>
            <span v-else class="text-sm text-muted-foreground">
              Différence actuelle : {{ formatCurrency(totals.debit - totals.credit) }}
            </span>
          </div>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Justification</template>
        <textarea
          v-model="form.memo"
          class="h-24 w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="Ex : Paiement facture fournisseur n°2024-15"
        />
      </BaseCard>

      <div class="space-y-3">
        <p v-if="submissionError" class="text-sm text-destructive">{{ submissionError }}</p>
        <ul v-if="globalErrors.length" class="list-disc space-y-1 pl-5 text-sm text-destructive">
          <li v-for="error in globalErrors" :key="error">{{ error }}</li>
        </ul>
        <BaseButton type="submit" :disabled="isSubmitting">Enregistrer l'écriture</BaseButton>
        <p v-if="submissionState === 'success'" class="text-sm text-primary">
          L'écriture a été créée avec le numéro {{ lastCreatedReference }}.
        </p>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import AutocompleteInput from '@/components/ui/AutocompleteInput.vue';
import { useLocaleFormatting } from '@/composables/useLocaleFormatting';
import { useAppStore, useAuthStore } from '@/store';

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface JournalOption {
  id: string;
  code: string;
  name: string;
}

interface FiscalYearOption {
  id: string;
  label: string;
  status: 'OPEN' | 'LOCKED';
}

interface EntryLineForm {
  id: string;
  accountId: string | null;
  debit: string;
  credit: string;
}

interface DashboardResponse {
  data: {
    fiscalYears: FiscalYearOption[];
    currentFiscalYear: FiscalYearOption | null;
    journals: Array<{ id: string; code: string; name: string; nextReference: string | null }>;
  };
}

const authStore = useAuthStore();
const appStore = useAppStore();
const { formatCurrency } = useLocaleFormatting();
const currency = computed(() => appStore.currency);

const accounts = ref<AccountOption[]>([]);
const journals = ref<JournalOption[]>([]);
const fiscalYears = ref<FiscalYearOption[]>([]);
const lines = ref<EntryLineForm[]>([createEmptyLine(), createEmptyLine()]);
const lastCreatedReference = ref<string | null>(null);
const submissionError = ref<string | null>(null);
const submissionState = ref<'idle' | 'success'>('idle');
const isSubmitting = ref(false);

const form = reactive({
  fiscalYearId: '',
  journalId: null as string | null,
  date: new Date().toISOString().slice(0, 10),
  memo: '',
});

const organizationId = computed(() => authStore.organizationId ?? 'demo-org');

const accountOptions = computed(() =>
  accounts.value.map((account) => ({
    id: account.id,
    label: `${account.code} — ${account.name}`,
    description: account.code,
  }))
);

const journalOptions = computed(() =>
  journals.value.map((journal) => ({
    id: journal.id,
    label: `${journal.code} — ${journal.name}`,
    description: journal.code,
  }))
);

const numericLines = computed(() =>
  lines.value.map((line) => {
    const debit = parseAmount(line.debit);
    const credit = parseAmount(line.credit);
    return { debit, credit };
  })
);

const totals = computed(() => {
  return numericLines.value.reduce(
    (sum, current) => {
      return {
        debit: sum.debit + current.debit,
        credit: sum.credit + current.credit,
      };
    },
    { debit: 0, credit: 0 }
  );
});

const lineErrors = computed(() =>
  lines.value.map((line, index) => {
    const errors: string[] = [];
    if (!line.accountId) {
      errors.push('Sélectionnez un compte.');
    }
    const { debit, credit } = numericLines.value[index];
    if (debit > 0 && credit > 0) {
      errors.push('Le débit et le crédit ne peuvent pas être tous deux renseignés.');
    }
    if (debit === 0 && credit === 0) {
      errors.push('Saisissez un montant en débit ou en crédit.');
    }
    return errors;
  })
);

const globalErrors = computed(() => {
  const errors: string[] = [];
  if (!form.fiscalYearId) {
    errors.push('Choisissez un exercice comptable.');
  }
  if (!form.journalId) {
    errors.push('Sélectionnez un journal.');
  }
  if (!lines.value.length || lineErrors.value.some((line) => line.length > 0)) {
    errors.push('Certaines lignes sont incomplètes ou invalides.');
  }
  if (totals.value.debit <= 0 || totals.value.credit <= 0) {
    errors.push('Les montants totaux doivent être strictement positifs.');
  }
  if (Math.abs(totals.value.debit - totals.value.credit) > 0.01) {
    errors.push('Le total des débits doit être égal au total des crédits.');
  }
  return [...new Set(errors)];
});

onMounted(async () => {
  await Promise.all([loadDashboard(), loadAccounts(), loadJournals()]);
});

async function loadDashboard() {
  const response = await fetch(`/api/v1/orgs/${organizationId.value}/accounting/dashboard`, {
    headers: authStore.authorizationHeader ?? {},
  });
  if (!response.ok) {
    console.warn('Unable to load dashboard information');
    return;
  }
  const payload = (await response.json()) as DashboardResponse;
  fiscalYears.value = payload.data.fiscalYears;
  if (!form.fiscalYearId) {
    form.fiscalYearId = payload.data.currentFiscalYear?.id ?? payload.data.fiscalYears[0]?.id ?? '';
  }
  if (!form.journalId && payload.data.journals.length) {
    const firstJournal = payload.data.journals[0];
    form.journalId = firstJournal.id;
    lastCreatedReference.value = firstJournal.nextReference;
  }
}

async function loadAccounts() {
  const response = await fetch(`/api/v1/orgs/${organizationId.value}/accounts`, {
    headers: authStore.authorizationHeader ?? {},
  });
  if (!response.ok) {
    console.warn('Unable to load accounts');
    return;
  }
  const payload = (await response.json()) as { data: AccountOption[] };
  accounts.value = payload.data;
}

async function loadJournals() {
  const response = await fetch(`/api/v1/orgs/${organizationId.value}/journals`, {
    headers: authStore.authorizationHeader ?? {},
  });
  if (!response.ok) {
    console.warn('Unable to load journals');
    return;
  }
  const payload = (await response.json()) as { data: JournalOption[] };
  journals.value = payload.data;
  if (!form.journalId && payload.data.length) {
    form.journalId = payload.data[0].id;
  }
}

function addLine() {
  lines.value.push(createEmptyLine());
}

function removeLine(index: number) {
  if (lines.value.length <= 2) {
    return;
  }
  lines.value.splice(index, 1);
}

async function submitEntry() {
  submissionError.value = null;
  submissionState.value = 'idle';

  if (globalErrors.value.length) {
    submissionError.value = 'Veuillez corriger les erreurs avant de valider.';
    return;
  }

  if (!form.fiscalYearId || !form.journalId) {
    submissionError.value = 'Journal et exercice sont requis.';
    return;
  }

  isSubmitting.value = true;

  try {
    const payload = {
      fiscalYearId: form.fiscalYearId,
      journalId: form.journalId,
      date: form.date,
      memo: form.memo || undefined,
      lines: lines.value.map((line) => ({
        accountId: line.accountId!,
        debit: formatAmountString(line.debit),
        credit: formatAmountString(line.credit),
      })),
    };

    const response = await fetch(`/api/v1/orgs/${organizationId.value}/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authStore.authorizationHeader ?? {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      submissionError.value = await readProblemDetails(response);
      return;
    }

    const result = (await response.json()) as { data: { reference: string | null } };
    submissionState.value = 'success';
    lastCreatedReference.value = result.data.reference ?? null;
    resetForm();
  } catch (error) {
    submissionError.value =
      error instanceof Error ? error.message : "L'écriture n'a pas pu être créée.";
  } finally {
    isSubmitting.value = false;
  }
}

function resetForm() {
  lines.value = [createEmptyLine(), createEmptyLine()];
  form.memo = '';
  form.date = new Date().toISOString().slice(0, 10);
}

function parseAmount(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') {
    return 0;
  }
  const normalizedString = typeof raw === 'number' ? raw.toString() : raw;
  const normalized = normalizedString.replace(',', '.');
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function formatAmountString(raw: string | number): string {
  const value = parseAmount(raw);
  return value.toFixed(2);
}

function createEmptyLine(): EntryLineForm {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2),
    accountId: null,
    debit: '',
    credit: '',
  };
}

async function readProblemDetails(response: Response) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string') {
      return payload.detail;
    }
  } catch (error) {
    console.warn('Unable to parse error response', error);
  }
  return "Une erreur est survenue lors de la création de l'écriture.";
}
</script>
