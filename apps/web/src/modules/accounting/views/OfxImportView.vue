<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground">
        Import OFX et lettrage bancaire
      </h1>
      <p class="max-w-3xl text-sm text-muted-foreground">
        Téléversez un fichier OFX pour analyser les écritures bancaires, obtenir des suggestions de correspondance et
        valider manuellement le lettrage. Les propositions automatiques sont signalées mais restent à confirmer avant
        validation finale.
      </p>
    </header>

    <BaseCard>
      <template #title>Fichier OFX</template>
      <template #description>
        Le fichier ne doit pas dépasser 20&nbsp;Mo et doit provenir de votre banque. Chaque ligne importée sera
        rapprochée avec les écritures comptables existantes.
      </template>

      <div class="space-y-4">
        <div class="space-y-2">
          <label for="ofx-file" class="text-sm font-medium text-foreground">Sélectionner un fichier OFX</label>
          <input
            id="ofx-file"
            ref="fileInput"
            type="file"
            accept=".ofx,application/x-ofx,text/xml"
            class="block w-full cursor-pointer rounded-lg border border-dashed border-outline bg-background px-3 py-10 text-center text-sm text-muted-foreground shadow-sm"
            data-testid="ofx-file-input"
            @change="onFileChange"
          />
          <p class="text-xs text-muted-foreground">
            Les transactions déjà importées (identifiant FITID identique) seront automatiquement ignorées.
          </p>
        </div>

        <div v-if="importState.status !== 'idle'" class="space-y-2" data-testid="ofx-progress">
          <div class="flex items-center justify-between text-sm text-muted-foreground">
            <span>{{ currentStepLabel }}</span>
            <span>{{ Math.round(progressPercentage) }}&nbsp;%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-primary transition-all"
              :style="{ width: `${progressPercentage}%` }"
              role="progressbar"
              :aria-valuemin="0"
              :aria-valuemax="100"
              :aria-valuenow="Math.round(progressPercentage)"
            />
          </div>
          <p class="text-xs text-muted-foreground">{{ stepDescription }}</p>
        </div>

        <div v-if="importState.fileName" class="rounded-lg border border-muted/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <div class="flex items-center justify-between">
            <span>Fichier chargé</span>
            <span class="font-medium text-foreground">{{ importState.fileName }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Transactions détectées</span>
            <span class="font-medium text-foreground">{{ importState.totalTransactions }}</span>
          </div>
        </div>
      </div>
    </BaseCard>

    <BaseCard v-if="transactions.length">
      <template #title>Transactions importées</template>
      <template #description>
        Consultez les suggestions de correspondance. Les correspondances automatiques requièrent une validation afin de
        conserver une traçabilité complète du lettrage.
      </template>

      <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <BaseBadge variant="outline">Total&nbsp;: {{ summary.total }}</BaseBadge>
            <BaseBadge variant="outline">Automatique&nbsp;: {{ summary.autoSuggested }}</BaseBadge>
            <BaseBadge variant="outline">À revoir&nbsp;: {{ summary.pending }}</BaseBadge>
            <BaseBadge variant="outline">Validé&nbsp;: {{ summary.validated }}</BaseBadge>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-outline/60 text-sm">
              <thead class="bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" class="px-4 py-3 text-left">Date</th>
                  <th scope="col" class="px-4 py-3 text-left">Libellé</th>
                  <th scope="col" class="px-4 py-3 text-right">Montant (€)</th>
                  <th scope="col" class="px-4 py-3 text-left">Suggestion</th>
                  <th scope="col" class="px-4 py-3" />
                </tr>
              </thead>
              <tbody class="divide-y divide-outline/40">
                <tr
                  v-for="transaction in transactions"
                  :key="transaction.id"
                  :class="[
                    'transition-colors',
                    selectedTransactionId === transaction.id ? 'bg-primary/5' : 'bg-background hover:bg-muted/40',
                  ]"
                >
                  <td class="px-4 py-3 align-top text-sm">{{ formatDate(transaction.postedOn) }}</td>
                  <td class="px-4 py-3 align-top text-sm">
                    <p class="font-medium text-foreground">{{ transaction.label }}</p>
                    <p class="text-xs text-muted-foreground">Réf. banque : {{ transaction.fitId }}</p>
                  </td>
                  <td class="px-4 py-3 align-top text-right text-sm font-medium text-foreground">
                    {{ formatAmount(transaction.amount) }}
                  </td>
                  <td class="px-4 py-3 align-top text-sm">
                    <BaseBadge v-if="transaction.status === 'validated'" variant="success">Lettré</BaseBadge>
                    <BaseBadge v-else-if="transaction.status === 'autoSuggested'" variant="outline">
                      Proposition automatique
                    </BaseBadge>
                    <BaseBadge v-else variant="outline">À valider</BaseBadge>
                    <p v-if="transaction.preselectedSuggestionId" class="mt-1 text-xs text-muted-foreground">
                      {{ getSuggestionLabel(transaction.preselectedSuggestionId) }}
                    </p>
                    <p v-else class="mt-1 text-xs text-muted-foreground">Aucune correspondance trouvée.</p>
                  </td>
                  <td class="px-4 py-3 align-top text-right">
                    <BaseButton
                      type="button"
                      size="sm"
                      variant="outline"
                      @click="selectTransaction(transaction.id)"
                    >
                      Examiner
                    </BaseButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="space-y-4">
          <BaseCard>
            <template #title>Transactions restantes</template>
            <p class="text-sm text-muted-foreground">
              {{ remainingToValidate }} transaction{{ remainingToValidate > 1 ? 's' : '' }} à valider avant de clôturer
              l'import.
            </p>
            <p v-if="currentStep === 'reconcile'" class="mt-2 text-sm text-primary">
              Toutes les transactions importées ont été lettrées.
            </p>
          </BaseCard>

          <BaseCard>
            <template #title>Historique des validations</template>
            <ul v-if="history.length" class="space-y-3 text-sm">
              <li v-for="entry in history" :key="entry.id" class="rounded-lg border border-outline/60 bg-background p-3">
                <p class="font-medium text-foreground">{{ entry.message }}</p>
                <p class="text-xs text-muted-foreground">{{ formatHistoryDate(entry.timestamp) }}</p>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">Aucune validation effectuée pour le moment.</p>
          </BaseCard>
        </aside>
      </div>
    </BaseCard>

    <div v-if="selectedTransaction" class="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <BaseCard>
        <template #title>Lettrage de la transaction sélectionnée</template>
        <template #description>
          Confirmez une correspondance proposée ou créez une nouvelle écriture pour finaliser le lettrage.
        </template>

        <div class="space-y-6">
          <section class="rounded-lg border border-outline/60 bg-muted/20 p-4">
            <h3 class="text-sm font-semibold text-foreground">Transaction</h3>
            <dl class="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <dt class="text-xs uppercase tracking-wide">Libellé</dt>
                <dd class="text-foreground">{{ selectedTransaction.label }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide">Date de valeur</dt>
                <dd class="text-foreground">{{ formatDate(selectedTransaction.postedOn) }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide">Montant</dt>
                <dd class="text-foreground">{{ formatAmount(selectedTransaction.amount) }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide">Identifiant FITID</dt>
                <dd class="text-foreground">{{ selectedTransaction.fitId }}</dd>
              </div>
            </dl>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-foreground">Suggestions de correspondance</h3>
              <span v-if="selectedTransaction.status === 'validated'" class="text-xs font-medium text-primary">
                Lettrage confirmé
              </span>
            </div>

            <div v-if="selectedTransaction.suggestions.length" class="space-y-3">
              <article
                v-for="suggestion in selectedTransaction.suggestions"
                :key="suggestion.id"
                class="rounded-lg border border-outline/60 bg-background p-4"
                :class="{
                  'border-primary shadow-sm':
                    suggestion.id === selectedTransaction.preselectedSuggestionId &&
                    selectedTransaction.status !== 'validated',
                }"
              >
                <header class="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p class="font-semibold text-foreground">{{ suggestion.reference }}</p>
                    <p class="text-xs text-muted-foreground">{{ suggestion.label }}</p>
                  </div>
                  <BaseBadge v-if="suggestion.matchType === 'AUTO'" variant="outline">Auto</BaseBadge>
                  <BaseBadge v-else variant="outline">Manuelle</BaseBadge>
                </header>

                <dl class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt>Montant</dt>
                    <dd class="text-foreground">{{ formatAmount(suggestion.amount) }}</dd>
                  </div>
                  <div>
                    <dt>Date de l'écriture</dt>
                    <dd class="text-foreground">{{ formatDate(suggestion.date) }}</dd>
                  </div>
                  <div>
                    <dt>Confiance</dt>
                    <dd class="text-foreground">{{ Math.round(suggestion.score * 100) }}&nbsp;%</dd>
                  </div>
                </dl>

                <div class="mt-4 flex flex-wrap items-center gap-3">
                  <BaseButton
                    type="button"
                    size="sm"
                    :disabled="selectedTransaction.status === 'validated'"
                    @click="confirmSuggestion(selectedTransaction.id, suggestion.id)"
                  >
                    Valider le lettrage
                  </BaseButton>
                  <p v-if="selectedTransaction.matchedSuggestionId === suggestion.id" class="text-xs text-primary">
                    Correspondance validée.
                  </p>
                </div>
              </article>
            </div>
            <p v-else class="text-sm text-muted-foreground">
              Aucun rapprochement proposé. Créez une écriture pour lettrer la transaction.
            </p>
          </section>

          <section class="space-y-3">
            <h3 class="text-sm font-semibold text-foreground">Validation manuelle</h3>
            <p class="text-xs text-muted-foreground">
              Renseignez la référence comptable et le compte de contrepartie pour créer une nouvelle écriture lettrée.
            </p>
            <form class="space-y-4" @submit.prevent="confirmManualEntry(selectedTransaction.id)">
              <div class="space-y-2">
                <label for="manual-reference" class="text-xs font-medium uppercase tracking-wide">Référence comptable</label>
                <input
                  id="manual-reference"
                  v-model="manualMatchForm.reference"
                  type="text"
                  required
                  placeholder="2025-BANQ-000145"
                  class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div class="space-y-2">
                <label for="manual-account" class="text-xs font-medium uppercase tracking-wide">Compte contrepartie</label>
                <input
                  id="manual-account"
                  v-model="manualMatchForm.accountCode"
                  type="text"
                  placeholder="706000 — Cotisations"
                  class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div class="space-y-2">
                <label for="manual-note" class="text-xs font-medium uppercase tracking-wide">Notes internes</label>
                <textarea
                  id="manual-note"
                  v-model="manualMatchForm.note"
                  rows="3"
                  placeholder="Justification du rapprochement"
                  class="w-full rounded-lg border border-outline bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <p v-if="manualMatchError" class="text-xs text-destructive">{{ manualMatchError }}</p>
              <BaseButton type="submit" size="sm">Créer l'écriture lettrée</BaseButton>
            </form>
          </section>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Historique de la transaction</template>
        <template #description>
          Les actions de lettrage sont journalisées pour assurer l'audit trail complet.
        </template>
        <ul v-if="selectedTransactionHistory.length" class="space-y-3 text-sm">
          <li
            v-for="entry in selectedTransactionHistory"
            :key="entry.id"
            class="rounded-lg border border-outline/60 bg-background p-3"
          >
            <p class="font-medium text-foreground">{{ entry.message }}</p>
            <p class="text-xs text-muted-foreground">{{ formatHistoryDate(entry.timestamp) }}</p>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Aucune action enregistrée sur cette transaction.</p>
      </BaseCard>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';

type ImportStep = 'upload' | 'analyse' | 'review' | 'reconcile';

type TransactionStatus = 'pending' | 'autoSuggested' | 'validated';

type MatchType = 'AUTO' | 'MANUAL';

interface LedgerEntryCandidate {
  id: string;
  reference: string;
  label: string;
  amount: number;
  date: string;
  accountCode: string;
}

interface MatchSuggestion {
  id: string;
  transactionId: string;
  entryId: string;
  reference: string;
  label: string;
  amount: number;
  date: string;
  score: number;
  matchType: MatchType;
}

interface ManualMatch {
  reference: string;
  accountCode: string;
  note?: string;
}

interface OfxTransaction {
  id: string;
  postedOn: string;
  label: string;
  amount: number;
  currency: string;
  fitId: string;
  status: TransactionStatus;
  suggestions: MatchSuggestion[];
  preselectedSuggestionId: string | null;
  matchedSuggestionId: string | null;
  manualMatch: ManualMatch | null;
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  message: string;
  transactionId: string;
}

interface ParsedTransaction {
  fitId: string;
  date: string;
  amount: number;
  label: string;
  currency: string;
}

const STEPS: Record<ImportStep, { label: string; description: string }> = {
  upload: {
    label: 'Sélection du fichier',
    description: 'Choisissez un fichier OFX exporté depuis votre banque.',
  },
  analyse: {
    label: 'Analyse du fichier',
    description: "Les transactions sont parsées et comparées aux écritures existantes.",
  },
  review: {
    label: 'Revue des suggestions',
    description: 'Validez les correspondances proposées ou préparez un lettrage manuel.',
  },
  reconcile: {
    label: 'Lettrage finalisé',
    description: 'Toutes les transactions importées ont été lettrées.',
  },
};

const existingLedgerEntries: LedgerEntryCandidate[] = [
  {
    id: 'entry-1',
    reference: '2025-BANQ-000112',
    label: 'Cotisations membres mars',
    amount: 250.0,
    date: '2025-03-05',
    accountCode: '706000',
  },
  {
    id: 'entry-2',
    reference: '2025-BANQ-000113',
    label: 'Facture imprimeur Avril',
    amount: -145.5,
    date: '2025-03-08',
    accountCode: '606300',
  },
  {
    id: 'entry-3',
    reference: '2025-BANQ-000114',
    label: 'Subvention projet jeunesse',
    amount: 1200,
    date: '2025-03-12',
    accountCode: '740000',
  },
  {
    id: 'entry-4',
    reference: '2025-BANQ-000115',
    label: 'Remboursement notes de frais',
    amount: -89.6,
    date: '2025-03-14',
    accountCode: '421000',
  },
];

const fileInput = ref<HTMLInputElement | null>(null);
const currentStep = ref<ImportStep>('upload');
const importState = reactive({
  status: 'idle' as 'idle' | 'reading' | 'analysing' | 'ready',
  fileName: '',
  totalTransactions: 0,
});

const transactions = ref<OfxTransaction[]>([]);
const history = ref<HistoryEntry[]>([]);
const selectedTransactionId = ref<string | null>(null);
const manualMatchError = ref<string | null>(null);

const manualMatchForm = reactive<ManualMatch>({
  reference: '',
  accountCode: '',
  note: '',
});

const progressPercentage = computed(() => {
  const order: ImportStep[] = ['upload', 'analyse', 'review', 'reconcile'];
  const index = order.indexOf(currentStep.value);
  if (index === -1) {
    return 0;
  }
  return ((index + 1) / order.length) * 100;
});

const currentStepLabel = computed(() => STEPS[currentStep.value].label);
const stepDescription = computed(() => STEPS[currentStep.value].description);

const selectedTransaction = computed(() =>
  transactions.value.find((transaction) => transaction.id === selectedTransactionId.value) ?? null
);

const selectedTransactionHistory = computed(() =>
  history.value.filter((entry) => entry.transactionId === selectedTransactionId.value)
);

const summary = computed(() => {
  const total = transactions.value.length;
  const autoSuggested = transactions.value.filter((transaction) => transaction.status === 'autoSuggested').length;
  const pending = transactions.value.filter((transaction) => transaction.status === 'pending').length;
  const validated = transactions.value.filter((transaction) => transaction.status === 'validated').length;
  return { total, autoSuggested, pending, validated };
});

const remainingToValidate = computed(() => transactions.value.filter((transaction) => transaction.status !== 'validated').length);

watch(
  () => transactions.value.length,
  (length) => {
    if (length > 0 && !selectedTransactionId.value) {
      selectedTransactionId.value = transactions.value[0]?.id ?? null;
    }
  }
);

watch(
  () => summary.value.validated,
  (validatedCount) => {
    if (validatedCount === transactions.value.length && validatedCount > 0) {
      currentStep.value = 'reconcile';
    }
  }
);

function resetImport() {
  transactions.value = [];
  history.value = [];
  selectedTransactionId.value = null;
  manualMatchForm.reference = '';
  manualMatchForm.accountCode = '';
  manualMatchForm.note = '';
  manualMatchError.value = null;
  currentStep.value = 'upload';
  importState.status = 'idle';
  importState.fileName = '';
  importState.totalTransactions = 0;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    resetImport();
    return;
  }

  importState.status = 'reading';
  importState.fileName = file.name;
  currentStep.value = 'analyse';
  try {
    const content = await readFileText(file);
    const parsedTransactions = parseOfx(content);
    importState.totalTransactions = parsedTransactions.length;
    importState.status = 'analysing';
    const enrichedTransactions = parsedTransactions.map((transaction, index) => buildTransaction(transaction, index));
    transactions.value = enrichedTransactions;
    currentStep.value = 'review';
  } catch (error) {
    console.error('OFX file read failed', error);
    manualMatchError.value = "Le fichier ne peut pas être lu. Vérifiez qu'il s'agit bien d'un OFX valide.";
    resetImport();
  }
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  throw new Error('File API not supported');
}

function buildTransaction(parsed: ParsedTransaction, index: number): OfxTransaction {
  const baseId = `${parsed.fitId || 'txn'}-${index}`;
  const suggestions = createSuggestions(parsed, baseId);
  const bestSuggestion = suggestions.find((suggestion) => suggestion.matchType === 'AUTO' && suggestion.score >= 0.8) ?? null;

  return {
    id: baseId,
    postedOn: parsed.date,
    label: parsed.label,
    amount: parsed.amount,
    currency: parsed.currency,
    fitId: parsed.fitId || `${baseId}-fallback`,
    status: bestSuggestion ? 'autoSuggested' : 'pending',
    suggestions,
    preselectedSuggestionId: bestSuggestion?.id ?? null,
    matchedSuggestionId: null,
    manualMatch: null,
  };
}

function parseOfx(content: string): ParsedTransaction[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const statementMatches = normalized.split('<STMTTRN>').slice(1);
  if (statementMatches.length === 0) {
    return [];
  }

  return statementMatches
    .map((chunk) => chunk.split('</STMTTRN>')[0] ?? chunk)
    .map((raw) => {
      const getValue = (tag: string) => {
        const regex = new RegExp(`<${tag}>([^\n<]+)`);
        const match = raw.match(regex);
        return match?.[1]?.trim() ?? '';
      };

      const dateRaw = getValue('DTPOSTED') || getValue('DTAVAIL');
      const amountRaw = getValue('TRNAMT');
      const label = getValue('NAME') || getValue('MEMO') || 'Transaction bancaire';
      const fitId = getValue('FITID');
      const currency = getValue('CURDEF') || 'EUR';

      return {
        fitId,
        date: parseOfxDate(dateRaw),
        amount: parseFloat(amountRaw || '0'),
        label,
        currency,
      } satisfies ParsedTransaction;
    })
    .filter((transaction) => Boolean(transaction.date));
}

function parseOfxDate(value: string): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const cleaned = value.trim();
  const year = cleaned.slice(0, 4);
  const month = cleaned.slice(4, 6);
  const day = cleaned.slice(6, 8);
  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

function createSuggestions(transaction: ParsedTransaction, baseId: string): MatchSuggestion[] {
  const labelNormalized = normalizeLabel(transaction.label);
  const amount = transaction.amount;
  const transactionDate = new Date(transaction.date);

  const candidates = existingLedgerEntries
    .map((entry) => {
      const amountScore = computeAmountScore(amount, entry.amount);
      const labelScore = computeLabelScore(labelNormalized, normalizeLabel(entry.label));
      const dateScore = computeDateScore(transactionDate, new Date(entry.date));
      const finalScore = 0.6 * amountScore + 0.3 * labelScore + 0.1 * dateScore;
      return {
        entry,
        score: Number(finalScore.toFixed(2)),
      };
    })
    .filter(({ score }) => score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return candidates.map(({ entry, score }, candidateIndex) => ({
    id: `${baseId}-suggestion-${candidateIndex}`,
    transactionId: baseId,
    entryId: entry.id,
    reference: entry.reference,
    label: entry.label,
    amount: entry.amount,
    date: entry.date,
    score,
    matchType: score >= 0.8 ? 'AUTO' : 'MANUAL',
  }));
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function computeAmountScore(transactionAmount: number, entryAmount: number): number {
  const diff = Math.abs(Math.abs(transactionAmount) - Math.abs(entryAmount));
  if (diff <= 0.01) {
    return 1;
  }
  if (diff <= 1) {
    return 0.7;
  }
  if (diff <= 5) {
    return 0.4;
  }
  return 0.1;
}

function computeLabelScore(transactionLabel: string, entryLabel: string): number {
  if (!transactionLabel || !entryLabel) {
    return 0.2;
  }
  const tokens = entryLabel.split(' ');
  const matches = tokens.filter((token) => token.length > 2 && transactionLabel.includes(token));
  if (matches.length === 0) {
    return 0.3;
  }
  const ratio = matches.length / tokens.length;
  return Math.min(1, 0.5 + ratio);
}

function computeDateScore(transactionDate: Date, entryDate: Date): number {
  const diffDays = Math.abs((transactionDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) {
    return 1;
  }
  if (diffDays <= 3) {
    return 0.7;
  }
  if (diffDays <= 7) {
    return 0.4;
  }
  return 0.2;
}

function confirmSuggestion(transactionId: string, suggestionId: string) {
  const transaction = transactions.value.find((txn) => txn.id === transactionId);
  if (!transaction) {
    return;
  }
  const suggestion = transaction.suggestions.find((item) => item.id === suggestionId);
  if (!suggestion) {
    return;
  }

  transaction.status = 'validated';
  transaction.matchedSuggestionId = suggestion.id;
  transaction.manualMatch = null;

  logHistory(
    `Lettrage confirmé avec ${suggestion.reference} (${Math.round(suggestion.score * 100)}%)`,
    transaction.id
  );
}

function confirmManualEntry(transactionId: string) {
  const transaction = transactions.value.find((txn) => txn.id === transactionId);
  if (!transaction) {
    return;
  }

  if (!manualMatchForm.reference.trim()) {
    manualMatchError.value = 'La référence comptable est obligatoire pour créer une écriture.';
    return;
  }

  manualMatchError.value = null;
  transaction.status = 'validated';
  transaction.matchedSuggestionId = null;
  transaction.manualMatch = {
    reference: manualMatchForm.reference.trim(),
    accountCode: manualMatchForm.accountCode.trim(),
    note: manualMatchForm.note?.trim() || undefined,
  };

  logHistory(`Lettrage manuel avec création ${transaction.manualMatch.reference}`, transaction.id);
  manualMatchForm.reference = '';
  manualMatchForm.accountCode = '';
  manualMatchForm.note = '';
}

function logHistory(message: string, transactionId: string) {
  const entry: HistoryEntry = {
    id: `${transactionId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    message,
    transactionId,
  };
  history.value = [entry, ...history.value].slice(0, 20);
}

function selectTransaction(transactionId: string) {
  selectedTransactionId.value = transactionId;
  manualMatchError.value = null;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { year: 'numeric', month: 'long', day: '2-digit' }).format(new Date(date));
}

function formatHistoryDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function getSuggestionLabel(suggestionId: string | null): string {
  if (!suggestionId) {
    return '';
  }
  const suggestion = transactions.value
    .flatMap((transaction) => transaction.suggestions)
    .find((item) => item.id === suggestionId);
  if (!suggestion) {
    return '';
  }
  return `${suggestion.reference} — ${formatAmount(suggestion.amount)}`;
}
</script>
