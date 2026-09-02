<script setup lang="ts">
/**
 * Diálogo de upload de documento (MD/TXT/PDF). Usa o elemento <dialog> nativo
 * para foco gerenciado e Esc para fechar. Input file acessível (label + aria),
 * drag-and-drop opcional. Estados: idle, enviando (loading), sucesso, erro.
 * Reaproveita a store de documents (não chama API direto).
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDocumentsStore } from '@/stores/documents';
import BaseButton from '@/components/BaseButton.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; uploaded: [] }>();

const documentsStore = useDocumentsStore();
const { uploading, uploadError } = storeToRefs(documentsStore);

const dialogRef = ref<HTMLDialogElement | null>(null);
const file = ref<File | null>(null);
const title = ref('');
const dragActive = ref(false);
const localError = ref<string | null>(null);

const ACCEPT = '.md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf';
const ACCEPTED_MIME = ['text/markdown', 'text/plain', 'application/pdf'];

const fileName = computed(() => file.value?.name ?? '');

watch(
  () => props.open,
  (open) => {
    const dialog = dialogRef.value;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      resetForm();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  },
);

function resetForm(): void {
  file.value = null;
  title.value = '';
  localError.value = null;
  documentsStore.clearUploadError();
}

function isAcceptedFile(candidate: File): boolean {
  if (ACCEPTED_MIME.includes(candidate.type)) {
    return true;
  }
  // Alguns navegadores não preenchem o type de .md: valida pela extensão.
  return /\.(md|markdown|txt|pdf)$/i.test(candidate.name);
}

function selectFile(candidate: File | undefined): void {
  localError.value = null;
  if (candidate === undefined) {
    return;
  }
  if (!isAcceptedFile(candidate)) {
    localError.value = 'Formato não suportado. Use arquivos MD, TXT ou PDF.';
    return;
  }
  file.value = candidate;
}

function onFileInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  selectFile(target.files?.[0]);
}

function onDrop(event: DragEvent): void {
  dragActive.value = false;
  selectFile(event.dataTransfer?.files?.[0]);
}

function onClose(): void {
  emit('close');
}

async function onSubmit(): Promise<void> {
  if (file.value === null) {
    localError.value = 'Selecione um arquivo para enviar.';
    return;
  }
  const result = await documentsStore.upload(file.value, title.value);
  if (result !== null) {
    emit('uploaded');
    emit('close');
  }
}
</script>

<template>
  <dialog ref="dialogRef" class="dialog" aria-labelledby="upload-title" @close="onClose">
    <form method="dialog" class="dialog__form" @submit.prevent="onSubmit">
      <h2 id="upload-title" class="dialog__title">Enviar documento</h2>
      <p class="dialog__hint">Formatos aceitos: Markdown, TXT e PDF.</p>

      <div class="field">
        <label class="field__label" for="doc-title">Título (opcional)</label>
        <input
          id="doc-title"
          v-model="title"
          type="text"
          class="field__input"
          placeholder="Deixe em branco para usar o nome do arquivo"
        />
      </div>

      <div
        class="dropzone"
        :class="{ 'dropzone--active': dragActive }"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <label class="dropzone__label" for="doc-file">
          <span aria-hidden="true" class="dropzone__icon">📄</span>
          <span>Arraste o arquivo aqui ou clique para escolher</span>
        </label>
        <input
          id="doc-file"
          type="file"
          class="dropzone__input"
          :accept="ACCEPT"
          @change="onFileInput"
        />
        <p v-if="fileName" class="dropzone__file">Selecionado: {{ fileName }}</p>
      </div>

      <p v-if="localError" class="dialog__error" role="alert">{{ localError }}</p>
      <p v-if="uploadError" class="dialog__error" role="alert">
        <span aria-hidden="true">⚠ </span>{{ uploadError }}
      </p>

      <div class="dialog__actions">
        <BaseButton variant="secondary" :disabled="uploading" @click="onClose">Cancelar</BaseButton>
        <BaseButton type="submit" variant="primary" :disabled="uploading">
          {{ uploading ? 'Enviando…' : 'Enviar' }}
        </BaseButton>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: 0;
  width: min(520px, 92vw);
  color: var(--color-pencil-gray);
}

.dialog::backdrop {
  background: rgba(0, 4, 55, 0.35);
}

.dialog__form {
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

.dialog__hint {
  font-size: var(--text-caption);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-weight: var(--font-weight-bold);
  font-size: var(--text-caption);
  color: var(--color-charcoal);
}

.field__input {
  padding: var(--spacing-12);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  font-size: var(--text-body);
  font-family: var(--font-duolingo-sans);
}

.dropzone {
  border: 2px dashed var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-24);
  text-align: center;
  position: relative;
}

.dropzone--active {
  border-color: var(--color-eager-green);
  background: var(--color-storybook-green);
}

.dropzone__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-8);
  cursor: pointer;
  color: var(--color-charcoal);
  font-weight: var(--font-weight-bold);
}

.dropzone__icon {
  font-size: 28px;
}

.dropzone__input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.dropzone__file {
  margin-top: var(--spacing-12);
  font-size: var(--text-caption);
  color: var(--color-eager-green);
  font-weight: var(--font-weight-bold);
}

.dialog__error {
  color: var(--color-error);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-bold);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-12);
}
</style>
