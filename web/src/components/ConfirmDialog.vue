<script setup lang="ts">
/**
 * Diálogo de confirmação reutilizável para ações destrutivas. Usa o elemento
 * <dialog> nativo (foco gerenciado, Esc para fechar, backdrop). Segue o mesmo
 * padrão visual do DocumentUpload. Não conhece a ação em si: emite `confirm` /
 * `cancel` e o pai decide o que fazer, exibindo `loading` durante a operação.
 */
import { ref, watch } from 'vue';
import BaseButton from '@/components/BaseButton.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    loadingLabel?: string;
    loading?: boolean;
  }>(),
  {
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    loadingLabel: 'Processando…',
    loading: false,
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialogRef = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (open) => {
    const dialog = dialogRef.value;
    if (dialog === null) {
      return;
    }
    // showModal/close podem não existir em ambientes sem suporte a <dialog>
    // (ex.: jsdom nos testes); a checagem mantém o componente resiliente.
    if (open && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else if (!open && dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  },
);

/**
 * Disparado quando o <dialog> fecha por qualquer via (Esc, backdrop). Se ainda
 * estiver "aberto" do ponto de vista do pai, tratamos como cancelamento — a menos
 * que uma operação esteja em andamento (loading), quando ignoramos o fechamento.
 */
function onDialogClose(): void {
  if (props.open && !props.loading) {
    emit('cancel');
  }
}

function onCancel(): void {
  if (!props.loading) {
    emit('cancel');
  }
}

function onConfirm(): void {
  emit('confirm');
}
</script>

<template>
  <dialog ref="dialogRef" class="dialog" aria-labelledby="confirm-title" @close="onDialogClose">
    <div class="dialog__body">
      <h2 id="confirm-title" class="dialog__title">{{ title }}</h2>
      <p class="dialog__message">{{ message }}</p>

      <div class="dialog__actions">
        <BaseButton variant="secondary" :disabled="loading" @click="onCancel">
          {{ cancelLabel }}
        </BaseButton>
        <BaseButton variant="primary" :disabled="loading" @click="onConfirm">
          {{ loading ? loadingLabel : confirmLabel }}
        </BaseButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: 0;
  width: min(440px, 92vw);
  color: var(--color-pencil-gray);
}

.dialog::backdrop {
  background: rgba(0, 4, 55, 0.35);
}

.dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  padding: var(--spacing-24);
}

.dialog__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}

.dialog__message {
  font-size: var(--text-body);
  line-height: var(--leading-body);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-12);
}
</style>
