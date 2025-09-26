<template>
  <section class="space-y-8">
    <header class="space-y-3">
      <BaseBadge variant="accent">Cotisations</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Statut des cotisations et relances
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Suivez en temps réel les adhésions payées, en attente ou en retard, et déclenchez les relances ciblées.
      </p>
    </header>

    <div class="grid gap-5 md:grid-cols-3">
      <BaseCard>
        <template #title>Cotisations payées</template>
        <template #description>Montant encaissé sur l'exercice en cours.</template>
        <p class="text-3xl font-semibold text-foreground">{{ formatCurrency(paidTotal) }}</p>
      </BaseCard>
      <BaseCard>
        <template #title>En attente</template>
        <template #description>Adhésions à valider avant échéance.</template>
        <p class="text-3xl font-semibold text-accent">{{ formatCurrency(pendingTotal) }}</p>
      </BaseCard>
      <BaseCard>
        <template #title>Retards critiques</template>
        <template #description>Montant à recouvrer avec relance prioritaire.</template>
        <p class="text-3xl font-semibold text-destructive">{{ formatCurrency(overdueTotal) }}</p>
      </BaseCard>
    </div>

    <div
      v-if="overdueItems.length"
      data-testid="reminder-banner"
      class="flex flex-col gap-3 rounded-2xl border border-destructive/50 bg-destructive/10 p-5 text-sm text-destructive"
    >
      <div class="flex items-center gap-2 font-semibold">
        <span class="text-lg">⚠️</span>
        <span>{{ overdueItems.length }} relance(s) urgentes à traiter cette semaine.</span>
      </div>
      <p class="text-destructive/80">
        Dernière relance envoyée le {{ formatDate(overdueItems[0].lastReminderAt ?? overdueItems[0].dueDate) }} pour
        {{ overdueItems[0].memberName }}. Pensez à générer un reçu après régularisation.
      </p>
      <div class="flex flex-wrap gap-2">
        <BaseButton variant="secondary" @click="navigateToMember(overdueItems[0].memberId)">
          Ouvrir la fiche prioritaire
        </BaseButton>
        <BaseButton variant="outline" @click="generateReminderBatch">Programmer les relances</BaseButton>
      </div>
      <p v-if="reminderQueued" class="text-xs text-destructive/80">
        Les relances ont été planifiées. Vous recevrez un récapitulatif par email.
      </p>
    </div>

    <div class="overflow-hidden rounded-2xl border border-outline/50">
      <table class="min-w-full divide-y divide-outline/60 text-sm">
        <thead class="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th class="px-5 py-4">Membre</th>
            <th class="px-5 py-4">Cotisation</th>
            <th class="px-5 py-4">Échéance</th>
            <th class="px-5 py-4">Montant</th>
            <th class="px-5 py-4">Statut</th>
            <th class="px-5 py-4">Dernière relance</th>
            <th class="px-5 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline/40 bg-surface">
          <tr
            v-for="item in contributionRows"
            :key="item.id"
            class="transition-colors hover:bg-muted/40"
            :class="focusedMemberId === item.memberId ? 'bg-primary/5 ring-2 ring-primary/40' : ''"
          >
            <td class="px-5 py-4">
              <button
                type="button"
                class="text-left font-medium text-foreground hover:text-primary"
                @click="navigateToMember(item.memberId)"
              >
                {{ item.memberName }}
              </button>
              <p class="text-xs text-muted-foreground">{{ item.membershipType }}</p>
            </td>
            <td class="px-5 py-4 text-muted-foreground">{{ item.label }}</td>
            <td class="px-5 py-4 text-muted-foreground">{{ formatDate(item.dueDate) }}</td>
            <td class="px-5 py-4 font-semibold text-foreground">{{ formatCurrency(item.amount) }}</td>
            <td class="px-5 py-4">
              <BaseBadge :variant="badgeVariant(item.status)" :class="badgeClass(item.status)">
                {{ badgeLabel(item.status) }}
              </BaseBadge>
            </td>
            <td class="px-5 py-4 text-muted-foreground">
              <span v-if="item.status === 'paid'">Aucune relance nécessaire</span>
              <span v-else-if="item.lastReminderAt">
                {{ formatDate(item.lastReminderAt) }} ({{ item.reminderCount }} envois)
              </span>
              <span v-else>Aucune</span>
            </td>
            <td class="px-5 py-4">
              <div class="flex justify-end gap-2">
                <BaseButton
                  variant="secondary"
                  class="px-3 py-1.5 text-xs"
                  @click="registerPayment(item.memberId, item.amount)"
                >
                  Enregistrer un paiement
                </BaseButton>
                <BaseButton variant="outline" class="px-3 py-1.5 text-xs" @click="queueReminder(item.memberId)">
                  Relancer
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
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';

import { useLocaleFormatting } from '@/composables/useLocaleFormatting';

import { membersDirectory, type MemberContribution } from '../data';

type ContributionRow = {
  id: string;
  memberId: string;
  memberName: string;
  membershipType: string;
  label: string;
  amount: number;
  dueDate: string;
  status: MemberContribution['status'];
  reminderCount: number;
  lastReminderAt?: string;
};

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'success';

const route = useRoute();
const router = useRouter();

const { formatCurrency, formatDate } = useLocaleFormatting();

const focusedMemberId = computed(() => (route.query.focus as string | undefined) ?? null);

const contributionRows = computed<ContributionRow[]>(() =>
  membersDirectory.flatMap((member) =>
    member.contributions.map((contribution) => ({
      id: `${member.id}-${contribution.id}`,
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
      membershipType: member.membershipType,
      label: contribution.label,
      amount: contribution.amount,
      dueDate: contribution.dueDate,
      status: contribution.status,
      reminderCount: contribution.reminderCount,
      lastReminderAt: contribution.lastReminderAt,
    })),
  ),
);

const paidTotal = computed(() =>
  contributionRows.value
    .filter((row) => row.status === 'paid')
    .reduce((total, row) => total + row.amount, 0),
);

const pendingTotal = computed(() =>
  contributionRows.value
    .filter((row) => row.status === 'pending')
    .reduce((total, row) => total + row.amount, 0),
);

const overdueTotal = computed(() =>
  contributionRows.value
    .filter((row) => row.status === 'overdue')
    .reduce((total, row) => total + row.amount, 0),
);

const overdueItems = computed(() => contributionRows.value.filter((row) => row.status === 'overdue'));

const reminderQueued = ref(false);

function badgeVariant(status: MemberContribution['status']): BadgeVariant {
  switch (status) {
    case 'paid':
      return 'success';
    case 'overdue':
      return 'outline';
    default:
      return 'accent';
  }
}

function badgeClass(status: MemberContribution['status']) {
  if (status === 'overdue') {
    return 'border-destructive/60 text-destructive';
  }
  if (status === 'pending') {
    return 'border-accent/40 text-accent';
  }
  return '';
}

function badgeLabel(status: MemberContribution['status']) {
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

function navigateToMember(memberId: string) {
  router.push({ name: 'members.detail', params: { memberId } });
}

function registerPayment(memberId: string, amount: number) {
  router.push({
    name: 'members.detail',
    params: { memberId },
    query: { paiement: amount.toFixed(2) },
  });
}

function queueReminder(memberId: string) {
  reminderQueued.value = true;
  setTimeout(() => {
    reminderQueued.value = false;
  }, 3000);
  if (focusedMemberId.value !== memberId) {
    router.replace({ name: 'members.contributions', query: { focus: memberId } });
  }
}

function generateReminderBatch() {
  reminderQueued.value = true;
  setTimeout(() => {
    reminderQueued.value = false;
  }, 3000);
}
</script>
