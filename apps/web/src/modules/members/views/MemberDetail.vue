<template>
  <section v-if="member" class="space-y-8">
    <header class="space-y-4">
      <BaseBadge :variant="statusVariant(member.status)" :class="statusClass(member.status)">
        {{ statusLabel(member.status) }}
      </BaseBadge>
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
            Fiche membre · {{ member.firstName }} {{ member.lastName }}
          </h1>
          <p class="max-w-2xl text-sm text-muted-foreground">
            Visualisez l'historique complet des cotisations, paiements et documents justificatifs liés à cet adhérent.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <BaseBadge v-for="tag in member.tags" :key="tag" variant="accent" class="capitalize">{{ tag }}</BaseBadge>
        </div>
      </div>
    </header>

    <div class="grid gap-5 lg:grid-cols-3">
      <BaseCard>
        <template #title>Coordonnées</template>
        <template #description>Données de contact vérifiées pour vos relances et reçus.</template>
        <ul class="space-y-2 text-sm text-muted-foreground">
          <li class="flex items-center gap-2">
            <span class="font-medium text-foreground">Email :</span>
            <a :href="`mailto:${member.email}`" class="text-primary hover:underline">{{ member.email }}</a>
          </li>
          <li class="flex items-center gap-2">
            <span class="font-medium text-foreground">Téléphone :</span>
            <a :href="`tel:${member.phone}`" class="text-primary hover:underline">{{ member.phone }}</a>
          </li>
          <li class="flex gap-2">
            <span class="font-medium text-foreground">Adresse :</span>
            <span>{{ member.address }}</span>
          </li>
        </ul>
      </BaseCard>

      <BaseCard>
        <template #title>Adhésion</template>
        <template #description>Suivi des échéances et du statut de renouvellement.</template>
        <dl class="space-y-2 text-sm text-muted-foreground">
          <div class="flex justify-between">
            <dt class="font-medium text-foreground">Type</dt>
            <dd>{{ member.membershipType }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-foreground">Adhérent depuis</dt>
            <dd>{{ formatDate(member.joinDate) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-foreground">Prochaine échéance</dt>
            <dd>{{ formatDate(member.nextRenewalDate) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-foreground">Solde à régulariser</dt>
            <dd :class="member.outstandingBalance > 0 ? 'text-destructive font-semibold' : ''">
              {{ formatCurrency(member.outstandingBalance) }}
            </dd>
          </div>
        </dl>
      </BaseCard>

      <BaseCard>
        <template #title>Documents</template>
        <template #description>Factures et reçus disponibles immédiatement.</template>
        <ul class="space-y-2 text-sm text-muted-foreground">
          <li v-for="invoice in member.invoices" :key="invoice.id" class="flex items-center justify-between">
            <span class="truncate">{{ invoice.label }}</span>
            <a
              :href="invoice.downloadUrl"
              class="text-primary hover:underline"
              :download="`facture_${invoice.id}.pdf`"
            >
              Télécharger
            </a>
          </li>
        </ul>
      </BaseCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <BaseCard>
        <template #title>Historique des cotisations</template>
        <template #description>Chaque cotisation est suivie avec son état et ses relances.</template>
        <div class="overflow-hidden rounded-xl border border-outline/40">
          <table class="min-w-full divide-y divide-outline/40 text-sm">
            <thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th class="px-4 py-3">Libellé</th>
                <th class="px-4 py-3">Échéance</th>
                <th class="px-4 py-3">Montant</th>
                <th class="px-4 py-3">Statut</th>
                <th class="px-4 py-3">Relances</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline/40 bg-surface">
              <tr v-for="contribution in member.contributions" :key="contribution.id" class="hover:bg-muted/40">
                <td class="px-4 py-3 font-medium text-foreground">{{ contribution.label }}</td>
                <td class="px-4 py-3 text-muted-foreground">{{ formatDate(contribution.dueDate) }}</td>
                <td class="px-4 py-3 text-muted-foreground">{{ formatCurrency(contribution.amount) }}</td>
                <td class="px-4 py-3">
                  <BaseBadge :variant="contributionBadge(contribution.status)" :class="contributionClass(contribution.status)">
                    {{ contributionLabel(contribution.status) }}
                  </BaseBadge>
                </td>
                <td class="px-4 py-3 text-muted-foreground">
                  <span v-if="contribution.reminderCount === 0">Aucune</span>
                  <span v-else>
                    {{ contribution.reminderCount }}
                    <span v-if="contribution.lastReminderAt">
                      · dernière le {{ formatDate(contribution.lastReminderAt) }}
                    </span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Paiements enregistrés</template>
        <template #description>Suivi des règlements affectés aux cotisations.</template>
        <ul class="space-y-3 text-sm">
          <li
            v-for="payment in member.payments"
            :key="payment.id"
            class="rounded-xl border border-outline/40 bg-muted/20 p-3"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-foreground">{{ formatCurrency(payment.amount) }}</span>
              <span class="text-xs text-muted-foreground">{{ formatDate(payment.date) }}</span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ payment.method }} · Réf. {{ payment.reference }}
            </p>
            <a v-if="payment.receiptUrl" :href="payment.receiptUrl" class="text-xs text-primary hover:underline">
              Télécharger le reçu
            </a>
            <p v-if="payment.note" class="mt-2 text-xs text-muted-foreground">{{ payment.note }}</p>
          </li>
        </ul>
      </BaseCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <BaseCard>
        <template #title>Enregistrer un paiement</template>
        <template #description>Lettrez immédiatement le règlement et mettez à jour le statut de la cotisation.</template>
        <form class="space-y-4" @submit.prevent="submitPayment">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-medium text-foreground">
              Montant ({{ currency }})
              <input
                v-model.number="paymentForm.amount"
                type="number"
                step="0.01"
                min="0"
                required
                class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
            <label class="text-sm font-medium text-foreground">
              Date de paiement
              <input
                v-model="paymentForm.date"
                type="date"
                required
                class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-medium text-foreground">
              Méthode
              <select
                v-model="paymentForm.method"
                class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <option value="Carte">Carte</option>
                <option value="Virement">Virement</option>
                <option value="Espèces">Espèces</option>
                <option value="Chèque">Chèque</option>
              </select>
            </label>
            <label class="text-sm font-medium text-foreground">
              Référence
              <input
                v-model="paymentForm.reference"
                type="text"
                placeholder="Référence bancaire"
                required
                class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          </div>
          <label class="text-sm font-medium text-foreground">
            Note interne
            <textarea
              v-model="paymentForm.note"
              rows="3"
              class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              placeholder="Ex : paiement reçu lors de la permanence du samedi"
            ></textarea>
          </label>
          <div class="flex items-center justify-between gap-3">
            <div class="text-xs text-muted-foreground">
              Le paiement sera lettré automatiquement sur la prochaine cotisation en attente.
            </div>
            <BaseButton type="submit">Enregistrer le paiement</BaseButton>
          </div>
          <p
            v-if="paymentSuccess"
            data-testid="payment-success"
            class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            Paiement enregistré et cotisation mise à jour.
          </p>
        </form>
      </BaseCard>

      <BaseCard>
        <template #title>Télécharger un reçu</template>
        <template #description>Ajoutez un justificatif transmis par l'adhérent pour consolider l'historique.</template>
        <form class="space-y-4" @submit.prevent="submitReceipt">
          <label class="text-sm font-medium text-foreground">
            Paiement concerné
            <select
              v-model="receiptForm.paymentId"
              required
              class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <option disabled value="">Sélectionner un paiement</option>
              <option v-for="payment in member.payments" :key="payment.id" :value="payment.id">
                {{ formatDate(payment.date) }} · {{ formatCurrency(payment.amount) }}
              </option>
            </select>
          </label>
          <label class="text-sm font-medium text-foreground">
            Reçu PDF
            <input
              ref="receiptInput"
              type="file"
              accept="application/pdf"
              required
              class="mt-1 block w-full rounded-lg border border-dashed border-outline/60 bg-background px-3 py-8 text-center text-sm text-muted-foreground"
              @change="handleReceiptChange"
            />
          </label>
          <p v-if="uploadedReceiptName" class="text-xs text-muted-foreground">
            Fichier sélectionné : {{ uploadedReceiptName }}
          </p>
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-muted-foreground">Le document sera disponible dans l'espace membre.</span>
            <BaseButton type="submit" variant="secondary">Joindre le reçu</BaseButton>
          </div>
          <p
            v-if="receiptSuccess"
            data-testid="receipt-success"
            class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            Reçu enregistré et accessible dans le portail adhérent.
          </p>
        </form>
      </BaseCard>
    </div>
  </section>

  <section v-else class="space-y-6">
    <BaseBadge variant="outline">Membre introuvable</BaseBadge>
    <p class="text-sm text-muted-foreground">
      Aucun membre ne correspond à cette référence. Retournez à la liste pour sélectionner un profil valide.
    </p>
    <BaseButton variant="outline" @click="goBack">Retour à la liste</BaseButton>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import { useLocaleFormatting } from '@/composables/useLocaleFormatting';
import { useAppStore } from '@/store';

import type { MemberContribution, MemberProfile } from '../data';
import { membersDirectory } from '../data';

type ContributionStatus = MemberContribution['status'];

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'success';

const route = useRoute();
const router = useRouter();

const { formatCurrency, formatDate } = useLocaleFormatting();
const appStore = useAppStore();
const currency = computed(() => appStore.currency);

const memberId = computed(() => route.params.memberId as string | undefined);

const initialMember = computed(() =>
  memberId.value ? membersDirectory.find((candidate) => candidate.id === memberId.value) ?? null : null,
);

const member = ref<MemberProfile | null>(
  initialMember.value ? (JSON.parse(JSON.stringify(initialMember.value)) as MemberProfile) : null,
);

const defaultPendingContribution = initialMember.value?.contributions.find((contribution) => contribution.status !== 'paid');

const paymentForm = reactive({
  amount: defaultPendingContribution?.amount ?? initialMember.value?.outstandingBalance ?? 0,
  date: new Date().toISOString().slice(0, 10),
  method: 'Virement' as MemberProfile['payments'][number]['method'],
  reference: '',
  note: '',
});

const receiptForm = reactive<{ paymentId: string; file: File | null }>({
  paymentId: member.value?.payments[0]?.id ?? '',
  file: null,
});

const paymentSuccess = ref(false);
const receiptSuccess = ref(false);
const uploadedReceiptName = ref('');
const receiptInput = ref<HTMLInputElement | null>(null);

function statusVariant(status: MemberProfile['status']): BadgeVariant {
  switch (status) {
    case 'A_JOUR':
      return 'success';
    case 'EN_RETARD':
      return 'outline';
    default:
      return 'accent';
  }
}

function statusClass(status: MemberProfile['status']) {
  if (status === 'EN_RETARD') {
    return 'border-destructive/60 text-destructive';
  }
  if (status === 'EN_ATTENTE') {
    return 'border-accent/40 text-accent-foreground';
  }
  return '';
}

function statusLabel(status: MemberProfile['status']) {
  switch (status) {
    case 'A_JOUR':
      return 'Cotisation à jour';
    case 'EN_RETARD':
      return 'Relance nécessaire';
    case 'EN_ATTENTE':
      return 'En attente de validation';
    default:
      return status;
  }
}

function contributionBadge(status: ContributionStatus): BadgeVariant {
  switch (status) {
    case 'paid':
      return 'success';
    case 'overdue':
      return 'outline';
    default:
      return 'accent';
  }
}

function contributionClass(status: ContributionStatus) {
  if (status === 'overdue') {
    return 'border-destructive/60 text-destructive';
  }
  if (status === 'pending') {
    return 'border-accent/40 text-accent-foreground';
  }
  return '';
}

function contributionLabel(status: ContributionStatus) {
  switch (status) {
    case 'paid':
      return 'Payée';
    case 'overdue':
      return 'En retard';
    case 'pending':
      return 'En attente';
    default:
      return status;
  }
}

function submitPayment() {
  if (!member.value) {
    return;
  }

  const paymentId = `pay-${Date.now()}`;
  member.value.payments.unshift({
    id: paymentId,
    amount: Number(paymentForm.amount),
    date: paymentForm.date,
    method: paymentForm.method,
    reference: paymentForm.reference,
    note: paymentForm.note,
    receiptUrl: undefined,
  });

  receiptForm.paymentId = paymentId;

  const pendingContribution = member.value.contributions.find((contribution) => contribution.status !== 'paid');
  if (pendingContribution) {
    pendingContribution.status = 'paid';
    pendingContribution.paymentDate = paymentForm.date;
    pendingContribution.reminderCount = 0;
    pendingContribution.lastReminderAt = undefined;
    pendingContribution.receiptUrl = pendingContribution.receiptUrl ?? `/documents/recus/${paymentId}.pdf`;
  }

  member.value.lastPaymentDate = paymentForm.date;
  member.value.outstandingBalance = Math.max(member.value.outstandingBalance - Number(paymentForm.amount), 0);
  paymentForm.amount = 0;
  paymentForm.reference = '';
  paymentForm.note = '';
  paymentSuccess.value = true;
  setTimeout(() => {
    paymentSuccess.value = false;
  }, 4000);
}

function handleReceiptChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  receiptForm.file = files && files.length ? files[0] : null;
  uploadedReceiptName.value = receiptForm.file ? receiptForm.file.name : '';
}

function submitReceipt() {
  if (!member.value || !receiptForm.paymentId || !receiptForm.file) {
    return;
  }

  const payment = member.value.payments.find((candidate) => candidate.id === receiptForm.paymentId);
  if (!payment) {
    return;
  }

  const generatedUrl = `/documents/recus/${receiptForm.file.name.replace(/\s+/g, '-').toLowerCase()}`;
  payment.receiptUrl = generatedUrl;
  receiptSuccess.value = true;
  uploadedReceiptName.value = '';
  receiptForm.file = null;
  if (receiptInput.value) {
    receiptInput.value.value = '';
  }
  setTimeout(() => {
    receiptSuccess.value = false;
  }, 4000);
}

function goBack() {
  router.push({ name: 'members.list' });
}
</script>
