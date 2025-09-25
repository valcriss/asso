<template>
  <section class="space-y-6">
    <header class="space-y-2">
      <BaseBadge>Comptabilité</BaseBadge>
      <h1 class="text-3xl font-display font-semibold tracking-tight text-foreground sm:text-4xl">
        Pilotage comptable centralisé
      </h1>
      <p class="max-w-2xl text-sm text-muted-foreground">
        Consolidez vos journaux, suivez la clôture des exercices et générez des exports FEC validés en quelques clics.
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-2">
      <BaseCard>
        <template #title>Journaux</template>
        <template #description>
          Visualisez l'activité de vos journaux (BANQ, CAISSE, VENTES, ACHATS) et accédez aux écritures validées.
        </template>
        <template #actions>
          <BaseButton variant="primary">Ouvrir les journaux</BaseButton>
        </template>
      </BaseCard>

      <BaseCard>
        <template #title>Clôtures &amp; audits</template>
        <template #description>
          Programmez les clôtures d'exercice, verrouillez les périodes et téléchargez les pièces justificatives associées.
        </template>
        <template #actions>
          <BaseButton variant="outline">Planifier une clôture</BaseButton>
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
