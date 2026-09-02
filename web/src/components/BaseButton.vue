<script setup lang="ts">
/**
 * Botão base no estilo Duolingo (sticker-like): radius 12px, sem sombra/gradiente.
 * - primary: fill verde (#58cc02), texto branco, uppercase 15px/700 — "progress/go".
 * - secondary: outline, texto azul (#1cb0f6), borda 2px #afafaf.
 * - ghost: sem borda, texto azul.
 * Sempre um <button> real, focável e com estado disabled acessível.
 */
type Variant = 'primary' | 'secondary' | 'ghost';
type ButtonType = 'button' | 'submit';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    type?: ButtonType;
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', type: 'button', disabled: false, block: false },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

function onClick(event: MouseEvent): void {
  if (!props.disabled) {
    emit('click', event);
  }
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="['btn', `btn--${variant}`, { 'btn--block': block }]"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-8);
  padding: 10px var(--spacing-16);
  border-radius: var(--radius-buttons);
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-nav-label);
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: var(--tracking-nav-label);
  cursor: pointer;
  border: 2px solid transparent;
  transition: filter 0.12s ease, background-color 0.12s ease;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--color-eager-green);
  color: var(--color-paper-white);
  border-color: transparent;
}

.btn--primary:not(:disabled):hover {
  filter: brightness(0.95);
}

.btn--secondary {
  background: transparent;
  color: var(--color-spark-blue);
  border-color: var(--color-faded-gray);
}

.btn--secondary:not(:disabled):hover {
  background: var(--color-storybook-green);
}

.btn--ghost {
  background: transparent;
  color: var(--color-spark-blue);
  border-color: transparent;
  text-transform: none;
  letter-spacing: normal;
}

.btn--ghost:not(:disabled):hover {
  text-decoration: underline;
}
</style>
