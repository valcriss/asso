<template>
  <section class="space-y-6">
    <header class="space-y-2">
      <BaseBadge variant="secondary">Membres</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Relations adhérents simplifiées
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Centralisez les profils, gérez les cotisations et suivez les paiements pour maintenir une communauté engagée.
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-2">
      <BaseCard>
        <template #title>Vue membres</template>
        <template #description>
          Filtrez vos adhérents par statut, tarif réduit ou projet associé et exportez leurs fiches en un clic.
        </template>
        <template #actions>
          <BaseButton variant="primary">Gérer les membres</BaseButton>
        </template>
      </BaseCard>

      <BaseCard>
        <template #title>Cotisations &amp; relances</template>
        <template #description>
          Configurez des modèles de cotisation, automatisez les relances et enregistrez les paiements avec lettrage comptable.
        </template>
        <template #actions>
          <BaseButton variant="outline">Configurer les modèles</BaseButton>
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
