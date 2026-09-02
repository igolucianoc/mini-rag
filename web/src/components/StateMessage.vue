<script setup lang="ts">
/**
 * Mensagem de estado reutilizável para empty/error. Usa ícone textual + título
 * + descrição e um slot de ação (ex.: botão de retry ou CTA). Em `error`,
 * aplica role="alert" para anúncio imediato; em `empty`, role="status".
 */
withDefaults(
  defineProps<{
    variant?: 'empty' | 'error';
    title: string;
    description?: string;
    icon?: string;
  }>(),
  { variant: 'empty', description: '', icon: '' },
);
</script>

<template>
  <div
    :class="['state', `state--${variant}`]"
    :role="variant === 'error' ? 'alert' : 'status'"
  >
    <span v-if="icon" class="state__icon" aria-hidden="true">{{ icon }}</span>
    <h2 class="state__title">{{ title }}</h2>
    <p v-if="description" class="state__desc">{{ description }}</p>
    <div v-if="$slots.action" class="state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-12);
  padding: var(--spacing-48) var(--spacing-24);
  border: 2px dashed var(--color-faded-gray);
  border-radius: var(--radius-xl);
  background: var(--color-paper-white);
}

.state--error {
  border-style: solid;
  border-color: var(--color-error);
  background: var(--color-error-wash);
}

.state__icon {
  font-size: 32px;
  line-height: 1;
}

.state__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}

.state--error .state__title {
  color: var(--color-error);
}

.state__desc {
  max-width: 42ch;
  color: var(--color-pencil-gray);
}

.state__action {
  margin-top: var(--spacing-8);
}
</style>
