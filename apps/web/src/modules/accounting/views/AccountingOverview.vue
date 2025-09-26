<template>
  <section class="space-y-8">
    <header class="space-y-3">
      <BaseBadge>Comptabilité</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Pilotage comptable centralisé
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Surveillez l'état fiscal, accédez aux journaux et préparez vos exports officiels depuis un seul tableau de bord.
      </p>
    </header>

    <BaseCard>
      <template #title>Exercice courant</template>
      <template #description>
        Suivez le statut de verrouillage et les dates clés de l'exercice actif.
      </template>

      <div v-if="error" class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="!dashboard" class="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Chargement des informations fiscales…
      </div>

      <div v-else class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-lg font-semibold text-foreground">
            {{ dashboard.currentFiscalYear?.label ?? 'Aucun exercice actif' }}
          </p>
          <p class="text-sm text-muted-foreground">
            Du {{ dashboard.currentFiscalYear ? formatDate(dashboard.currentFiscalYear.startDate) : '—' }} au
            {{ dashboard.currentFiscalYear ? formatDate(dashboard.currentFiscalYear.endDate) : '—' }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span
            v-if="dashboard.currentFiscalYear?.status === 'LOCKED'"
            class="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700"
          >
            Exercice verrouillé
          </span>
          <span
            v-else
            class="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700"
          >
            Saisie autorisée
          </span>
          <RouterLink to="/comptabilite/ecritures/nouvelle">
            <BaseButton>Nouvelle écriture</BaseButton>
          </RouterLink>
        </div>
      </div>
    </BaseCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <BaseCard>
        <template #title>Journaux &amp; séquences</template>
        <template #description>
          Vérifiez la prochaine pièce à attribuer par journal et accédez au détail des écritures.
        </template>

        <div v-if="!dashboard" class="py-6 text-sm text-muted-foreground">Chargement…</div>
        <div v-else class="space-y-4">
          <table class="min-w-full divide-y divide-outline text-sm">
            <thead class="bg-muted/40">
              <tr>
                <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Journal</th>
                <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Dernière pièce</th>
                <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Prochaine pièce</th>
                <th class="px-3 py-2 text-left font-semibold text-muted-foreground">Dernière écriture</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline/60">
              <tr v-for="journal in dashboard.journals" :key="journal.id">
                <td class="px-3 py-2 text-foreground">{{ journal.code }} — {{ journal.name }}</td>
                <td class="px-3 py-2 text-foreground">{{ journal.lastReference ?? '—' }}</td>
                <td class="px-3 py-2 text-foreground">{{ journal.nextReference ?? '—' }}</td>
                <td class="px-3 py-2 text-foreground">
                  {{ journal.lastEntryDate ? formatDate(journal.lastEntryDate) : 'Aucune écriture' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div class="flex gap-3">
            <RouterLink to="/comptabilite/journal">
              <BaseButton variant="outline">Consulter le journal</BaseButton>
            </RouterLink>
            <RouterLink to="/comptabilite/grand-livre">
              <BaseButton variant="outline">Voir le grand livre</BaseButton>
            </RouterLink>
          </div>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Exports &amp; conformité</template>
        <template #description>
          Préparez vos états financiers : balance générale, journal détaillé et export FEC.
        </template>
        <ul class="space-y-3 text-sm text-foreground">
          <li class="flex items-start gap-2">
            <span class="mt-1 text-primary">•</span>
            <div>
              <p class="font-medium">Balance comptable</p>
              <p class="text-muted-foreground">Accès direct aux totaux débit/crédit par compte.</p>
              <RouterLink to="/comptabilite/balance" class="text-primary hover:underline">Ouvrir la balance</RouterLink>
            </div>
          </li>
          <li class="flex items-start gap-2">
            <span class="mt-1 text-primary">•</span>
            <div>
              <p class="font-medium">Export FEC</p>
              <p class="text-muted-foreground">
                Assurez la conformité légale des exports FEC pour vos audits.
              </p>
            </div>
          </li>
        </ul>
        <div class="mt-4 flex gap-3">
          <RouterLink to="/comptabilite/ecritures/nouvelle">
            <BaseButton variant="primary">Saisir une écriture</BaseButton>
          </RouterLink>
          <RouterLink to="/comptabilite/journal">
            <BaseButton variant="ghost">Historique</BaseButton>
          </RouterLink>
        </div>
      </BaseCard>

      <BaseCard>
        <template #title>Banque &amp; Rapprochement</template>
        <template #description>
          Importez vos relevés OFX et définissez des règles automatiques de normalisation.
        </template>
        <ul class="space-y-3 text-sm text-foreground">
          <li class="flex items-start gap-2">
            <span class="mt-1 text-primary">•</span>
            <div>
              <p class="font-medium">Import OFX</p>
              <p class="text-muted-foreground">Détectez et lettrer vos transactions bancaires.</p>
              <RouterLink to="/comptabilite/import-ofx" class="text-primary hover:underline">Aller à l'import OFX</RouterLink>
            </div>
          </li>
          <li class="flex items-start gap-2">
            <span class="mt-1 text-primary">•</span>
            <div>
              <p class="font-medium">Règles OFX</p>
              <p class="text-muted-foreground">Créez des règles de correspondance par motif.</p>
              <RouterLink to="/comptabilite/regles-ofx" class="text-primary hover:underline">Gérer les règles</RouterLink>
            </div>
          </li>
        </ul>
      </BaseCard>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import { useLocaleFormatting } from '@/composables/useLocaleFormatting';
import { useAuthStore } from '@/store';

interface FiscalDashboardYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'LOCKED';
}

interface FiscalDashboardJournal {
  id: string;
  code: string;
  name: string;
  nextReference: string | null;
  lastReference: string | null;
  lastEntryDate: string | null;
}

interface FiscalDashboardResponse {
  data: {
    fiscalYears: FiscalDashboardYear[];
    currentFiscalYear: (FiscalDashboardYear & { lockedAt: string | null }) | null;
    journals: FiscalDashboardJournal[];
  };
}

const authStore = useAuthStore();
const { formatDate } = useLocaleFormatting();
const organizationId = computed(() => authStore.organizationId ?? 'demo-org');

const dashboard = ref<{
  fiscalYears: FiscalDashboardYear[];
  currentFiscalYear: (FiscalDashboardYear & { lockedAt: string | null }) | null;
  journals: FiscalDashboardJournal[];
} | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  await loadDashboard();
});

async function loadDashboard() {
  const response = await fetch(`/api/v1/orgs/${organizationId.value}/accounting/dashboard`, {
    headers: authStore.authorizationHeader ?? {},
  });
  if (!response.ok) {
    error.value = 'Impossible de récupérer les informations comptables.';
    return;
  }
  const payload = (await response.json()) as FiscalDashboardResponse;
  dashboard.value = payload.data;
}
</script>
