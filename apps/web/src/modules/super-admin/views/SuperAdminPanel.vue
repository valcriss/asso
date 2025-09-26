<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <BaseBadge variant="accent">Supervision</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Supervision des organisations et contrôle d'accès
      </h1>
      <p class="max-w-3xl text-sm text-muted-foreground">
        Recherchez un locataire, verrouillez temporairement l'accès ou renouvelez les secrets API pour sécuriser l'écosystème.
      </p>
    </header>

    <BaseCard>
      <template #title>Indicateurs clés</template>
      <template #description>Photographie rapide de l'activité multi-organisations.</template>
      <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="space-y-1 rounded-xl bg-muted/40 p-4">
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">Organisations visibles</dt>
          <dd class="text-2xl font-semibold text-foreground">{{ organizations.length }}</dd>
        </div>
        <div class="space-y-1 rounded-xl bg-muted/40 p-4">
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">Actives</dt>
          <dd class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{{ activeCount }}</dd>
        </div>
        <div class="space-y-1 rounded-xl bg-muted/40 p-4">
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">Verrouillées</dt>
          <dd class="text-2xl font-semibold text-destructive">{{ lockedCount }}</dd>
        </div>
        <div class="space-y-1 rounded-xl bg-muted/40 p-4">
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">Dernier secret généré</dt>
          <dd class="text-sm font-medium text-foreground">
            {{ latestSecretRotation ? formatDateTime(latestSecretRotation) : '—' }}
          </dd>
        </div>
      </dl>
    </BaseCard>

    <div class="space-y-6 rounded-2xl border border-outline/60 bg-surface p-6 shadow-soft">
      <form class="grid gap-4 sm:grid-cols-[minmax(0,1fr),200px,auto]" @submit.prevent="fetchOrganizations">
        <input
          v-model="searchTerm"
          type="search"
          placeholder="Rechercher une organisation (nom ou UUID)"
          class="h-11 rounded-lg border border-outline/60 bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <select
          v-model="statusFilter"
          class="h-11 rounded-lg border border-outline/60 bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">Toutes</option>
          <option value="active">Actives uniquement</option>
          <option value="locked">Verrouillées</option>
        </select>
        <BaseButton type="submit" class="h-11 px-6">Actualiser</BaseButton>
      </form>

      <div v-if="error" class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="isLoading" class="space-y-3">
        <div class="h-4 w-36 animate-pulse rounded bg-muted/40"></div>
        <div class="h-52 animate-pulse rounded-2xl bg-muted/30"></div>
      </div>

      <div v-else class="overflow-hidden rounded-2xl border border-outline/60">
        <table class="min-w-full divide-y divide-outline/50 text-sm">
          <thead class="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">Organisation</th>
              <th class="px-4 py-3 font-medium text-right">Projets</th>
              <th class="px-4 py-3 font-medium">Statut</th>
              <th class="px-4 py-3 font-medium">Verrouillage</th>
              <th class="px-4 py-3 font-medium">Secret API</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline/30">
            <tr v-for="organization in organizations" :key="organization.id" class="transition-colors hover:bg-muted/20">
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-foreground">{{ organization.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ organization.id }}</span>
                  <span class="text-xs text-muted-foreground">
                    Créée le {{ formatDateTime(organization.createdAt) }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-right font-medium text-foreground">{{ organization.projectCount }}</td>
              <td class="px-4 py-3">
                <BaseBadge :variant="organization.status === 'LOCKED' ? 'outline' : 'secondary'">
                  {{ organization.status === 'LOCKED' ? 'Verrouillée' : 'Active' }}
                </BaseBadge>
              </td>
              <td class="px-4 py-3 text-xs text-muted-foreground">
                <div class="flex flex-col gap-1">
                  <span v-if="organization.lockedAt">
                    Depuis {{ formatDateTime(organization.lockedAt) }}
                  </span>
                  <span v-if="organization.lockReason">Motif : {{ organization.lockReason }}</span>
                  <span v-if="organization.lockedBy">Par : {{ organization.lockedBy }}</span>
                  <span v-if="!organization.lockedAt">—</span>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-muted-foreground">
                <div class="flex flex-col gap-1">
                  <span>
                    {{ organization.hasActiveSecret ? 'Secret actif' : 'Aucun secret généré' }}
                  </span>
                  <span v-if="organization.lastSecretRotationAt">
                    Renouvelé {{ formatDateTime(organization.lastSecretRotationAt) }}
                  </span>
                  <span v-if="recentSecrets[organization.id]" class="font-mono text-sm text-foreground">
                    {{ recentSecrets[organization.id] }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex flex-wrap justify-end gap-2">
                  <BaseButton
                    size="sm"
                    variant="outline"
                    @click="organization.status === 'LOCKED' ? unlockOrganization(organization) : lockOrganization(organization)"
                  >
                    {{ organization.status === 'LOCKED' ? 'Déverrouiller' : 'Verrouiller' }}
                  </BaseButton>
                  <BaseButton size="sm" variant="ghost" @click="rotateSecret(organization)">
                    Renouveler le secret
                  </BaseButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="actionError" class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {{ actionError }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import { apiFetchJson } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface OrganizationSummary {
  id: string;
  name: string;
  createdAt: string;
  status: 'ACTIVE' | 'LOCKED';
  lockedAt: string | null;
  lockedBy: string | null;
  lockReason: string | null;
  hasActiveSecret: boolean;
  lastSecretRotationAt: string | null;
  projectCount: number;
}

interface OrganizationListResponse {
  data: OrganizationSummary[];
}

interface RotateSecretResponse {
  data: OrganizationSummary & { secret: string };
}

const organizations = ref<OrganizationSummary[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const searchTerm = ref('');
const statusFilter = ref<'all' | 'active' | 'locked'>('all');
const recentSecrets = reactive<Record<string, string>>({});

const activeCount = computed(() => organizations.value.filter((item) => item.status === 'ACTIVE').length);
const lockedCount = computed(() => organizations.value.filter((item) => item.status === 'LOCKED').length);
const latestSecretRotation = computed(() => {
  const sorted = organizations.value
    .map((item) => item.lastSecretRotationAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return sorted[0] ?? null;
});

onMounted(() => {
  void fetchOrganizations();
});

watch(statusFilter, () => {
  void fetchOrganizations();
});

async function fetchOrganizations() {
  isLoading.value = true;
  error.value = null;

  try {
    const params = new URLSearchParams();
    const query = searchTerm.value.trim();
    if (query && query.length < 2) {
      error.value = 'Veuillez saisir au moins deux caractères pour la recherche.';
      return;
    }
    if (query) {
      params.set('q', query);
    }
    if (statusFilter.value !== 'all') {
      params.set('status', statusFilter.value);
    }

    const response = await apiFetchJson<OrganizationListResponse>(
      `/api/v1/super-admin/organizations${params.size ? `?${params.toString()}` : ''}`,
    );
    organizations.value = response.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Impossible de récupérer les organisations.';
  } finally {
    isLoading.value = false;
  }
}

function updateOrganization(updated: OrganizationSummary) {
  const index = organizations.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) {
    organizations.value.splice(index, 1, updated);
  } else {
    organizations.value.push(updated);
  }
}

async function lockOrganization(organization: OrganizationSummary) {
  actionError.value = null;
  const reason = window.prompt('Motif du verrouillage (optionnel)')?.trim();

  try {
    const response = await apiFetchJson<{ data: OrganizationSummary }>(
      `/api/v1/super-admin/organizations/${organization.id}/lock`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: reason && reason.length > 0 ? reason : undefined }),
      },
    );
    updateOrganization(response.data);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Impossible de verrouiller l'organisation.";
  }
}

async function unlockOrganization(organization: OrganizationSummary) {
  actionError.value = null;
  try {
    const response = await apiFetchJson<{ data: OrganizationSummary }>(
      `/api/v1/super-admin/organizations/${organization.id}/lock`,
      { method: 'DELETE' },
    );
    updateOrganization(response.data);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Impossible de déverrouiller l'organisation.";
  }
}

async function rotateSecret(organization: OrganizationSummary) {
  actionError.value = null;
  try {
    const response = await apiFetchJson<RotateSecretResponse>(
      `/api/v1/super-admin/organizations/${organization.id}/rotate-secret`,
      { method: 'POST' },
    );
    updateOrganization(response.data);
    recentSecrets[organization.id] = response.data.secret;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Impossible de renouveler le secret.';
  }
}
</script>
