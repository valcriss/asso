<template>
  <section class="space-y-8">
    <header class="space-y-3">
      <BaseBadge variant="accent">Vue 3 • Pinia • TailwindCSS</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        Bienvenue dans votre espace de gestion associative
      </h1>
      <p class="max-w-2xl text-base text-muted-foreground">
        Consolidez la comptabilité, le suivi des adhésions et le pilotage de vos projets depuis une interface unique et accessible
        sur tous les supports.
      </p>
      <div class="flex flex-col gap-3 sm:flex-row">
        <BaseButton variant="primary">Créer une écriture</BaseButton>
        <BaseButton variant="secondary">Importer un relevé OFX</BaseButton>
      </div>
    </header>

    <div class="grid gap-6 lg:grid-cols-2">
      <BaseCard>
        <template #icon>
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span class="text-2xl">📊</span>
          </span>
        </template>
        <template #title>Vue synthétique</template>
        <template #description>
          Visualisez la santé financière de l'association avec un tableau de bord clair : soldes bancaires, journaux récents et
          prévisions budgétaires.
        </template>
        <template #actions>
          <BaseButton variant="ghost">Consulter les rapports</BaseButton>
        </template>
      </BaseCard>

      <BaseCard>
        <template #icon>
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent-foreground">
            <span class="text-2xl">🤝</span>
          </span>
        </template>
        <template #title>Suivi des membres</template>
        <template #description>
          Automatisez l'attribution des cotisations, générez des reçus fiscaux et envoyez des relances ciblées à vos adhérents en
          quelques clics.
        </template>
        <template #actions>
          <BaseButton variant="ghost">Voir les membres</BaseButton>
        </template>
      </BaseCard>

      <BaseCard>
        <template #icon>
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary-foreground">
            <span class="text-2xl">🔒</span>
          </span>
        </template>
        <template #title>Conformité garantie</template>
        <template #description>
          Journaux séquencés, export FEC et traçabilité intégrale des opérations garantissent une comptabilité irréprochable lors
          des audits.
        </template>
        <template #actions>
          <BaseButton variant="ghost">Préparer l'audit</BaseButton>
        </template>
      </BaseCard>

      <BaseCard>
        <template #icon>
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <span class="text-2xl">📬</span>
          </span>
        </template>
        <template #title>Alertes proactives</template>
        <template #description>
          Notifications automatiques pour les subventions, relances de cotisations et clôtures annuelles afin de garder le cap.
        </template>
        <template #actions>
          <BaseButton variant="ghost">Configurer les alertes</BaseButton>
        </template>
      </BaseCard>
    </div>
  </section>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
</script>
