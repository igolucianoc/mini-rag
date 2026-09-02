<script setup lang="ts">
/**
 * Badge de status do documento. Acessibilidade: o estado NUNCA é indicado só
 * por cor — sempre há um ícone (símbolo textual) + rótulo legível. A cor é um
 * reforço, não o único canal.
 */
import { computed } from 'vue';
import type { DocumentStatus } from '@/types/api';

const props = defineProps<{ status: DocumentStatus }>();

interface BadgeMeta {
  readonly label: string;
  readonly icon: string;
  readonly variant: 'ready' | 'processing' | 'failed';
}

const BADGE_META: Readonly<Record<DocumentStatus, BadgeMeta>> = {
  READY: { label: 'Pronto', icon: '✓', variant: 'ready' },
  PROCESSING: { label: 'Processando', icon: '…', variant: 'processing' },
  FAILED: { label: 'Falhou', icon: '!', variant: 'failed' },
};

const meta = computed<BadgeMeta>(() => BADGE_META[props.status]);
</script>

<template>
  <span :class="['badge', `badge--${meta.variant}`]">
    <span class="badge__icon" aria-hidden="true">{{ meta.icon }}</span>
    <span class="badge__label">{{ meta.label }}</span>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-xl);
  border: 2px solid var(--color-faded-gray);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.badge__icon {
  font-weight: var(--font-weight-bold);
}

.badge--ready {
  border-color: var(--color-eager-green);
  color: var(--color-charcoal);
}

.badge--ready .badge__icon {
  color: var(--color-eager-green);
}

.badge--processing {
  border-color: var(--color-spark-blue);
  color: var(--color-charcoal);
}

.badge--processing .badge__icon {
  color: var(--color-spark-blue);
}

.badge--failed {
  border-color: var(--color-error);
  color: var(--color-error);
}
</style>
