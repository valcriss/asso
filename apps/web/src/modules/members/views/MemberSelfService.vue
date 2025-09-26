<template>
  <section class="space-y-8">
    <header class="space-y-3">
      <BaseBadge variant="secondary">Portail adhérent</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Bienvenue {{ member.firstName }}
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Consultez votre statut d'adhésion, vos factures et téléchargez vos reçus fiscaux en toute autonomie.
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-3">
      <BaseCard>
        <template #title>Statut de l'adhésion</template>
        <template #description>Renouvellement prévu le {{ formatDate(member.nextRenewalDate) }}.</template>
        <BaseBadge :variant="statusVariant(member.status)" :class="statusClass(member.status)">
          {{ statusLabel(member.status) }}
        </BaseBadge>
      </BaseCard>
      <BaseCard>
        <template #title>Solde</template>
        <template #description>Montant restant à régler sur vos cotisations.</template>
        <p :class="member.outstandingBalance > 0 ? 'text-destructive' : 'text-foreground'" class="text-3xl font-semibold">
          {{ member.outstandingBalance.toFixed(2) }} €
        </p>
      </BaseCard>
      <BaseCard>
        <template #title>Dernier paiement</template>
        <template #description>Conservez la trace de vos règlements.</template>
        <p class="text-3xl font-semibold text-foreground">{{ formatDate(member.lastPaymentDate ?? member.joinDate) }}</p>
      </BaseCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <BaseCard>
        <template #title>Historique de cotisation</template>
        <template #description>Retrouvez vos factures et statuts ligne par ligne.</template>
        <div class="overflow-hidden rounded-xl border border-outline/40">
          <table class="min-w-full divide-y divide-outline/40 text-sm">
            <thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th class="px-4 py-3">Libellé</th>
                <th class="px-4 py-3">Échéance</th>
                <th class="px-4 py-3">Montant</th>
                <th class="px-4 py-3">Statut</th>
                <th class="px-4 py-3">Document</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline/40 bg-surface">
              <tr v-for="invoice in member.invoices" :key="invoice.id" class="hover:bg-muted/40">
                <td class="px-4 py-3 font-medium text-foreground">{{ invoice.label }}</td>
                <td class="px-4 py-3 text-muted-foreground">{{ formatDate(invoice.dueDate) }}</td>
                <td class="px-4 py-3 text-muted-foreground">{{ invoice.amount.toFixed(2) }} €</td>
                <td class="px-4 py-3">
                  <BaseBadge :variant="invoiceBadge(invoice.status)" :class="invoiceClass(invoice.status)">
                    {{ invoiceLabel(invoice.status) }}
                  </BaseBadge>
                </td>
                <td class="px-4 py-3">
                  <a
                    :href="invoice.downloadUrl"
                    class="text-sm text-primary hover:underline"
                    :download="`facture_${invoice.id}.pdf`"
                  >
                    Télécharger la facture
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Vos reçus</template>
        <template #description>Disponibles pour vos déclarations fiscales.</template>
        <ul class="space-y-3 text-sm">
          <li
            v-for="payment in member.payments"
            :key="payment.id"
            class="flex items-center justify-between rounded-xl border border-outline/40 bg-muted/20 px-4 py-3"
          >
            <div>
              <p class="font-semibold text-foreground">{{ payment.amount.toFixed(2) }} €</p>
              <p class="text-xs text-muted-foreground">{{ formatDate(payment.date) }} · {{ payment.method }}</p>
            </div>
            <a
              v-if="payment.receiptUrl"
              :href="payment.receiptUrl"
              data-testid="download-receipt"
              class="text-sm text-primary hover:underline"
              :download="`recu_cotisation_${payment.id}.pdf`"
            >
              Télécharger
            </a>
            <span v-else class="text-xs text-muted-foreground">Reçu en cours d'émission</span>
          </li>
        </ul>
      </BaseCard>
    </div>

    <BaseCard>
      <template #title>Mettre à jour mes informations</template>
      <template #description>Vous pouvez corriger vos coordonnées pour recevoir les notifications.</template>
      <form class="grid gap-4 md:grid-cols-2" @submit.prevent="requestUpdate">
        <label class="text-sm font-medium text-foreground">
          Email
          <input
            v-model="updateForm.email"
            type="email"
            required
            class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </label>
        <label class="text-sm font-medium text-foreground">
          Téléphone
          <input
            v-model="updateForm.phone"
            type="tel"
            class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </label>
        <label class="md:col-span-2 text-sm font-medium text-foreground">
          Adresse
          <textarea
            v-model="updateForm.address"
            rows="3"
            class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          ></textarea>
        </label>
        <div class="md:col-span-2 flex items-center justify-between gap-3">
          <p class="text-xs text-muted-foreground">Une notification sera envoyée au trésorier pour validation.</p>
          <BaseButton type="submit">Envoyer ma demande</BaseButton>
        </div>
        <p
          v-if="updateSuccess"
          class="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          Vos informations ont bien été transmises. Vous recevrez un email de confirmation.
        </p>
      </form>
    </BaseCard>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';

import type { MemberInvoice, MemberProfile } from '../data';
import { membersDirectory } from '../data';

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'success';

type InvoiceStatus = MemberInvoice['status'];

const member = membersDirectory[0];

const updateForm = reactive({
  email: member.email,
  phone: member.phone,
  address: member.address,
});

const updateSuccess = ref(false);

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

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
    return 'border-accent/40 text-accent';
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

function invoiceBadge(status: InvoiceStatus): BadgeVariant {
  switch (status) {
    case 'paid':
      return 'success';
    case 'overdue':
      return 'outline';
    default:
      return 'accent';
  }
}

function invoiceClass(status: InvoiceStatus) {
  if (status === 'overdue') {
    return 'border-destructive/60 text-destructive';
  }
  if (status === 'pending') {
    return 'border-accent/40 text-accent';
  }
  return '';
}

function invoiceLabel(status: InvoiceStatus) {
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

function requestUpdate() {
  updateSuccess.value = true;
  setTimeout(() => {
    updateSuccess.value = false;
  }, 3000);
}
</script>
