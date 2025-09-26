<template>
  <section class="space-y-8">
    <header class="space-y-3">
      <BaseBadge variant="secondary">Membres</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Relations adhérents simplifiées
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Centralisez les profils, gérez les cotisations et anticipez les relances depuis une vue unifiée.
      </p>
      <div class="flex flex-wrap gap-3">
        <BaseButton variant="outline" @click="goToContributions()">Suivi des cotisations</BaseButton>
        <BaseButton variant="ghost" @click="goToSelfService()">Portail membre</BaseButton>
      </div>
    </header>

    <div class="grid gap-5 md:grid-cols-3">
      <BaseCard>
        <template #title>Total adhérents actifs</template>
        <template #description>Inscrits disposant d'une cotisation en cours de validité.</template>
        <p class="text-3xl font-semibold text-foreground">{{ activeMembers }}</p>
      </BaseCard>
      <BaseCard>
        <template #title>Cotisations en retard</template>
        <template #description>Montant cumulé à recouvrer sur les exercices en cours.</template>
        <p class="text-3xl font-semibold text-destructive">{{ formatCurrency(overdueAmount) }}</p>
      </BaseCard>
      <BaseCard>
        <template #title>Relances programmées</template>
        <template #description>Rappels à envoyer cette semaine aux adhérents concernés.</template>
        <p class="text-3xl font-semibold text-foreground">{{ pendingReminders }}</p>
      </BaseCard>
    </div>

    <div class="overflow-hidden rounded-2xl border border-outline/50">
      <table class="min-w-full divide-y divide-outline/60 text-sm">
        <thead class="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" class="px-6 py-4">Membre</th>
            <th scope="col" class="px-6 py-4">Type</th>
            <th scope="col" class="px-6 py-4">Statut</th>
            <th scope="col" class="px-6 py-4">Dernier paiement</th>
            <th scope="col" class="px-6 py-4">Solde</th>
            <th scope="col" class="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline/40 bg-surface">
          <tr v-for="member in members" :key="member.id" class="hover:bg-muted/40">
            <td class="px-6 py-4">
              <div class="flex flex-col">
                <button
                  type="button"
                  class="text-left font-medium text-foreground transition-colors hover:text-primary"
                  @click="goToDetail(member.id)"
                >
                  {{ member.firstName }} {{ member.lastName }}
                </button>
                <span class="text-xs text-muted-foreground">{{ member.email }}</span>
              </div>
            </td>
            <td class="px-6 py-4 text-muted-foreground">{{ member.membershipType }}</td>
            <td class="px-6 py-4">
              <BaseBadge :variant="statusVariant(member.status)" :class="statusClass(member.status)">
                {{ statusLabel(member.status) }}
              </BaseBadge>
            </td>
            <td class="px-6 py-4 text-muted-foreground">
              <template v-if="member.lastPaymentDate">
                {{ formatDate(member.lastPaymentDate) }}
              </template>
              <template v-else>
                Aucun paiement enregistré
              </template>
            </td>
            <td class="px-6 py-4 font-medium" :class="member.outstandingBalance > 0 ? 'text-destructive' : 'text-foreground'">
              {{ formatCurrency(member.outstandingBalance) }}
            </td>
            <td class="px-6 py-4">
              <div class="flex justify-end gap-2">
                <BaseButton
                  variant="secondary"
                  class="px-3 py-1.5 text-xs"
                  @click="goToDetail(member.id)"
                >
                  Fiche
                </BaseButton>
                <BaseButton
                  variant="outline"
                  class="px-3 py-1.5 text-xs"
                  @click="goToContributions(member.id)"
                >
                  Cotisations
                </BaseButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import { useLocaleFormatting } from '@/composables/useLocaleFormatting';

import { membersDirectory, type MemberProfile } from '../data';

type StatusVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'success';

const router = useRouter();
const { formatCurrency, formatDate } = useLocaleFormatting();

const members = computed<MemberProfile[]>(() => membersDirectory);

const activeMembers = computed(() => members.value.filter((member) => member.status !== 'EN_RETARD').length);
const overdueAmount = computed(() =>
  members.value
    .filter((member) => member.outstandingBalance > 0)
    .reduce((total, member) => total + member.outstandingBalance, 0),
);
const pendingReminders = computed(() =>
  members.value.reduce((count, member) => count + member.contributions.filter((c) => c.status !== 'paid').length, 0),
);

function statusVariant(status: MemberProfile['status']): StatusVariant {
  switch (status) {
    case 'A_JOUR':
      return 'success';
    case 'EN_RETARD':
      return 'outline';
    default:
      return 'accent';
  }
}

function statusLabel(status: MemberProfile['status']) {
  switch (status) {
    case 'A_JOUR':
      return 'À jour';
    case 'EN_RETARD':
      return 'En retard';
    case 'EN_ATTENTE':
      return 'En attente';
    default:
      return status;
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

function goToDetail(memberId: string) {
  router.push({ name: 'members.detail', params: { memberId } });
}

function goToContributions(memberId?: string) {
  router.push({ name: 'members.contributions', query: memberId ? { focus: memberId } : undefined });
}

function goToSelfService() {
  router.push({ name: 'members.selfService' });
}
</script>
