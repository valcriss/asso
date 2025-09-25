<template>
  <section class="space-y-6">
    <header class="space-y-2">
      <BaseBadge variant="accent">Subventions</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Financements sécurisés
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Suivez vos projets subventionnés, respectez les échéances et documentez chaque dépense pour faciliter les justificatifs.
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-2">
      <BaseCard>
        <template #title>Suivi des projets</template>
        <template #description>
          Cartographiez vos projets, affectez les dépenses analytiques et contrôlez leur consommation budgétaire.
        </template>
        <template #actions>
          <BaseButton variant="primary">Ouvrir un projet</BaseButton>
        </template>
      </BaseCard>

      <BaseCard>
        <template #title>Justificatifs prêts</template>
        <template #description>
          Exportez des dossiers complets pour vos financeurs avec pièces jointes, rapports analytiques et relevés bancaires.
        </template>
        <template #actions>
          <BaseButton variant="outline">Préparer un dossier</BaseButton>
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
