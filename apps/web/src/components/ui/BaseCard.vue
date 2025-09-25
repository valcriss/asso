<template>
  <article class="flex h-full flex-col justify-between gap-6 rounded-xl border border-outline/60 bg-surface p-6 shadow-soft">
    <div class="space-y-4">
      <slot name="icon" />
      <div class="space-y-2">
        <h2 class="text-xl font-semibold text-foreground">
          <slot name="title" />
        </h2>
        <p class="text-sm text-muted-foreground">
          <slot name="description" />
        </p>
      </div>
      <div>
        <slot />
      </div>
    </div>
    <div class="pt-2">
      <slot name="actions" />
    </div>
  </article>
</template>
