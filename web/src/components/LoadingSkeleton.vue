<script setup lang="ts">
/**
 * Skeleton de carregamento (não spinner), no estilo flat do tema. Renderiza N
 * linhas/blocos com um pulse sutil. Anuncia "carregando" a leitores de tela.
 */
withDefaults(defineProps<{ lines?: number; label?: string }>(), {
  lines: 3,
  label: 'Carregando…',
});
</script>

<template>
  <div class="skeleton" role="status" aria-live="polite">
    <span class="sr-only">{{ label }}</span>
    <div v-for="line in lines" :key="line" class="skeleton__block" aria-hidden="true" />
  </div>
</template>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
}

.skeleton__block {
  height: 20px;
  border-radius: var(--radius-xl);
  background: var(--color-storybook-green);
  border: 2px solid #e6f7d6;
  animation: skeleton-pulse 1.2s ease-in-out infinite;
}

.skeleton__block:nth-child(even) {
  width: 80%;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton__block {
    animation: none;
  }
}
</style>
