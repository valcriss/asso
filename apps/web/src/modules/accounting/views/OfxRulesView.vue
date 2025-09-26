<template>
  <section class="space-y-6">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold text-foreground">Règles OFX</h1>
      <p class="text-sm text-muted-foreground">Définissez des règles de normalisation pour les libellés bancaires importés (OFX).</p>
    </header>

    <BaseCard>
      <template #title>Créer une règle</template>
      <form class="grid gap-4 md:grid-cols-5 items-end" @submit.prevent="createRule">
        <label class="md:col-span-2 text-sm font-medium text-foreground">
          Libellé normalisé
          <input v-model="form.normalizedLabel" class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm" required />
        </label>
        <label class="md:col-span-2 text-sm font-medium text-foreground">
          Motif (regex)
          <input v-model="form.pattern" class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm" required />
        </label>
        <label class="text-sm font-medium text-foreground">
          Priorité
          <input v-model.number="form.priority" type="number" min="0" class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm" />
        </label>
        <label class="md:col-span-2 text-sm font-medium text-foreground">
          Compte bancaire (optionnel)
          <select v-model="form.bankAccountId" class="mt-1 w-full rounded-lg border border-outline/40 bg-background px-3 py-2 text-sm">
            <option :value="undefined">Global (tous comptes)</option>
            <option v-for="acc in bankAccounts" :key="acc.id" :value="acc.id">{{ acc.name }} — {{ acc.iban }}</option>
          </select>
        </label>
        <div class="flex items-center gap-3">
          <label class="inline-flex items-center gap-2 text-sm text-foreground">
            <input v-model="form.isActive" type="checkbox" class="rounded border-outline/40" /> Active
          </label>
          <BaseButton type="submit">Ajouter</BaseButton>
        </div>
        <p v-if="error" class="md:col-span-5 text-sm text-destructive">{{ error }}</p>
      </form>
    </BaseCard>

    <BaseCard>
      <template #title>Règles existantes</template>
      <template #description>
        <div class="flex items-center gap-3">
          <label class="inline-flex items-center gap-2 text-sm text-foreground">
            <input v-model="filter.activeOnly" type="checkbox" class="rounded border-outline/40" /> Actives seulement
          </label>
          <BaseButton variant="secondary" @click="fetchRules">Actualiser</BaseButton>
        </div>
      </template>
      <div class="overflow-x-auto rounded-xl border border-outline/40">
        <table class="min-w-full divide-y divide-outline/40 text-sm">
          <thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th class="px-4 py-3">Motif</th>
              <th class="px-4 py-3">Libellé normalisé</th>
              <th class="px-4 py-3">Compte</th>
              <th class="px-4 py-3">Priorité</th>
              <th class="px-4 py-3">Active</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline/40 bg-surface">
            <tr v-for="rule in rules" :key="rule.id">
              <td class="px-4 py-3 font-mono">{{ rule.pattern }}</td>
              <td class="px-4 py-3">{{ rule.normalizedLabel }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ bankAccountName(rule.bankAccountId) }}</td>
              <td class="px-4 py-3">{{ rule.priority }}</td>
              <td class="px-4 py-3">
                <BaseBadge :variant="rule.isActive ? 'success' : 'outline'">{{ rule.isActive ? 'Oui' : 'Non' }}</BaseBadge>
              </td>
              <td class="px-4 py-3 text-right space-x-2">
                <BaseButton size="sm" variant="secondary" @click="toggleActive(rule)">{{ rule.isActive ? 'Désactiver' : 'Activer' }}</BaseButton>
                <BaseButton size="sm" variant="outline" @click="removeRule(rule)">Supprimer</BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import { apiFetchJson } from '@/lib/api';
import { useAuthStore } from '@/store';

interface BankAccount { id: string; name: string; iban: string }
interface OfxRule { id: string; bankAccountId?: string | null; pattern: string; normalizedLabel: string; priority: number; isActive: boolean }

const auth = useAuthStore();
const orgId = auth.organizationId!;

const rules = ref<OfxRule[]>([]);
const bankAccounts = ref<BankAccount[]>([]);
const error = ref<string | null>(null);
const filter = reactive({ activeOnly: false });

type CreateRulePayload = {
  bankAccountId?: string;
  pattern: string;
  normalizedLabel: string;
  priority: number;
  isActive: boolean;
};

const form = reactive<CreateRulePayload>({
  bankAccountId: undefined,
  pattern: '',
  normalizedLabel: '',
  priority: 0,
  isActive: true,
});
const route = useRoute();

function bankAccountName(id?: string | null): string {
  if (!id) return 'Global';
  const acc = bankAccounts.value.find((a) => a.id === id);
  return acc ? `${acc.name}` : 'Compte inconnu';
}

async function fetchAccounts() {
  const data = await apiFetchJson<{ data: BankAccount[] }>(`/api/v1/orgs/${orgId}/bank/accounts`);
  bankAccounts.value = data.data;
}

async function fetchRules() {
  const params = new URLSearchParams();
  if (filter.activeOnly) params.set('active', 'true');
  const data = await apiFetchJson<{ data: OfxRule[] }>(`/api/v1/orgs/${orgId}/bank/ofx-rules?${params.toString()}`);
  rules.value = data.data;
}

async function createRule() {
  error.value = null;
  try {
    const payload: CreateRulePayload = {
      pattern: form.pattern,
      normalizedLabel: form.normalizedLabel,
      priority: form.priority,
      isActive: form.isActive,
    };
    if (form.bankAccountId) {
      payload.bankAccountId = form.bankAccountId;
    }

    await apiFetchJson<{ data: OfxRule }>(`/api/v1/orgs/${orgId}/bank/ofx-rules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    form.pattern = '';
    form.normalizedLabel = '';
    form.priority = 0;
    form.bankAccountId = undefined;
    form.isActive = true;
    await fetchRules();
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Impossible de créer la règle';
  }
}

async function toggleActive(rule: OfxRule) {
  const updated = await apiFetchJson<{ data: OfxRule }>(`/api/v1/orgs/${orgId}/bank/ofx-rules/${rule.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive: !rule.isActive }),
  });
  const idx = rules.value.findIndex((r) => r.id === rule.id);
  if (idx >= 0) rules.value[idx] = updated.data;
}

async function removeRule(rule: OfxRule) {
  await apiFetchJson<void>(`/api/v1/orgs/${orgId}/bank/ofx-rules/${rule.id}`, { method: 'DELETE' });
  rules.value = rules.value.filter((r) => r.id !== rule.id);
}

onMounted(async () => {
  await Promise.all([fetchAccounts(), fetchRules()]);
  // Prefill from query if present
  if (typeof route.query.pattern === 'string') {
    form.pattern = route.query.pattern;
  }
  if (typeof route.query.normalizedLabel === 'string') {
    form.normalizedLabel = route.query.normalizedLabel;
  }
});
</script>
