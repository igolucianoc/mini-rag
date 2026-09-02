<script setup lang="ts">
/**
 * Chat RAG com streaming SSE (via fetch). Fluxo visível:
 *  - retrieving -> "Buscando nos seus documentos…"
 *  - streaming  -> tokens chegando incrementalmente (answerText)
 *  - context_ready/source -> fontes e citações
 *  - completed  -> estado final; se hadSufficientEvidence=false, destaca a
 *    mensagem de "sem evidência suficiente" (não inventa resposta)
 *  - failed / erro de transporte -> estado de erro com opção de tentar de novo
 * Filtro opcional por documentos (READY) e escolha de topK.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@/stores/chat';
import { useDocumentsStore } from '@/stores/documents';
import type { AskRequest } from '@/types/api';
import AppShell from '@/components/AppShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import CitationList from '@/components/CitationList.vue';

const chatStore = useChatStore();
const documentsStore = useDocumentsStore();
const {
  phase,
  answerText,
  contextSources,
  citations,
  streamError,
  isStreaming,
  hasNoEvidence,
} = storeToRefs(chatStore);
const { items } = storeToRefs(documentsStore);

const draft = ref('');
const topK = ref(5);
const selectedDocIds = ref<string[]>([]);

const readyDocuments = computed(() => items.value.filter((doc) => doc.status === 'READY'));
const canSubmit = computed(() => draft.value.trim().length > 0 && !isStreaming.value);
const showRetrieving = computed(
  () => phase.value === 'starting' || phase.value === 'retrieving',
);
const showAnswer = computed(
  () => phase.value === 'streaming' || phase.value === 'done',
);

onMounted(() => {
  if (items.value.length === 0) {
    void documentsStore.load();
  }
});

onUnmounted(() => {
  chatStore.cancel();
});

function buildRequest(): AskRequest {
  const documentIds = selectedDocIds.value.length > 0 ? [...selectedDocIds.value] : undefined;
  return { question: draft.value.trim(), topK: topK.value, documentIds };
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) {
    return;
  }
  await chatStore.askStream(buildRequest());
}

async function onRetry(): Promise<void> {
  await chatStore.askStream(buildRequest());
}

function onNewQuestion(): void {
  chatStore.reset();
  draft.value = '';
}
</script>

<template>
  <AppShell>
    <h1 class="title">Perguntar</h1>
    <p class="subtitle">Respostas fundamentadas apenas nos seus documentos.</p>

    <form class="ask" @submit.prevent="onSubmit">
      <div class="field">
        <label class="field__label" for="question">Sua pergunta</label>
        <textarea
          id="question"
          v-model="draft"
          class="field__textarea"
          rows="3"
          placeholder="Ex.: O que o documento diz sobre autenticação?"
          :disabled="isStreaming"
        />
      </div>

      <div class="controls">
        <div class="field field--inline">
          <label class="field__label" for="topk">Trechos (topK)</label>
          <input
            id="topk"
            v-model.number="topK"
            type="number"
            min="1"
            max="20"
            class="field__number"
            :disabled="isStreaming"
          />
        </div>

        <fieldset v-if="readyDocuments.length > 0" class="filter">
          <legend class="field__label">Filtrar por documentos (opcional)</legend>
          <div class="filter__options">
            <label v-for="doc in readyDocuments" :key="doc.id" class="filter__option">
              <input
                v-model="selectedDocIds"
                type="checkbox"
                :value="doc.id"
                :disabled="isStreaming"
              />
              <span>{{ doc.title }}</span>
            </label>
          </div>
        </fieldset>
      </div>

      <div class="ask__actions">
        <BaseButton type="submit" variant="primary" :disabled="!canSubmit">
          {{ isStreaming ? 'Perguntando…' : 'Perguntar' }}
        </BaseButton>
        <BaseButton
          v-if="phase === 'done' || phase === 'error'"
          variant="secondary"
          @click="onNewQuestion"
        >
          Nova pergunta
        </BaseButton>
      </div>
    </form>

    <!-- Estado: buscando contexto -->
    <div v-if="showRetrieving" class="panel" role="status" aria-live="polite">
      <span class="panel__pulse" aria-hidden="true">🔎</span>
      <span>Buscando nos seus documentos…</span>
    </div>

    <!-- Estado: falha -->
    <div v-else-if="phase === 'error'" class="panel panel--error" role="alert">
      <p class="panel__error-text"><span aria-hidden="true">⚠ </span>{{ streamError }}</p>
      <BaseButton variant="primary" @click="onRetry">Tentar de novo</BaseButton>
    </div>

    <!-- Estado: resposta (streaming ou final) -->
    <section v-else-if="showAnswer" class="answer" aria-label="Resposta">
      <div v-if="hasNoEvidence" class="no-evidence" role="status">
        <span class="no-evidence__icon" aria-hidden="true">🤷</span>
        <div>
          <h2 class="no-evidence__title">Sem evidência suficiente</h2>
          <p>{{ answerText }}</p>
        </div>
      </div>

      <template v-else>
        <div class="answer__body" aria-live="polite">
          <p class="answer__text">{{ answerText }}</p>
          <span v-if="isStreaming" class="answer__caret" aria-hidden="true" />
        </div>

        <p v-if="contextSources.length > 0 && citations.length === 0" class="answer__context">
          {{ contextSources.length }} trecho(s) recuperado(s) como contexto.
        </p>

        <CitationList :citations="citations" />
      </template>
    </section>
  </AppShell>
</template>

<style scoped>
.title {
  font-family: var(--font-feather);
  font-weight: 900;
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
}

.subtitle {
  color: var(--color-pencil-gray);
  margin-bottom: var(--spacing-24);
}

.ask {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-24);
  margin-bottom: var(--spacing-24);
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
  text-transform: uppercase;
  letter-spacing: var(--tracking-nav-label);
}

.field__textarea,
.field__number {
  padding: var(--spacing-12);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  font-family: var(--font-duolingo-sans);
  font-size: var(--text-body);
  color: var(--color-charcoal);
  resize: vertical;
}

.field__number {
  width: 96px;
}

.controls {
  display: flex;
  gap: var(--spacing-24);
  flex-wrap: wrap;
}

.filter {
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-12);
  min-width: 0;
  flex: 1 1 240px;
}

.filter__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--spacing-8);
  max-height: 160px;
  overflow: auto;
}

.filter__option {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  color: var(--color-charcoal);
  font-size: var(--text-caption);
}

.ask__actions {
  display: flex;
  gap: var(--spacing-12);
}

.panel {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  border: 2px solid var(--color-spark-blue);
  border-radius: var(--radius-xl);
  padding: var(--spacing-16);
  color: var(--color-charcoal);
}

.panel--error {
  border-color: var(--color-error);
  background: var(--color-error-wash);
  flex-direction: column;
  align-items: flex-start;
}

.panel__error-text {
  color: var(--color-error);
  font-weight: var(--font-weight-bold);
}

.panel__pulse {
  font-size: 22px;
  animation: pulse 1.1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel__pulse {
    animation: none;
  }
}

.answer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
}

.answer__body {
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-24);
}

.answer__text {
  color: var(--color-charcoal);
  font-size: var(--text-body);
  line-height: 1.5;
  white-space: pre-wrap;
  display: inline;
}

.answer__caret {
  display: inline-block;
  width: 8px;
  height: 18px;
  margin-left: 2px;
  background: var(--color-eager-green);
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.answer__context {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.no-evidence {
  display: flex;
  gap: var(--spacing-16);
  border: 2px solid var(--color-spark-blue);
  background: var(--color-storybook-green);
  border-radius: var(--radius-xl);
  padding: var(--spacing-24);
}

.no-evidence__icon {
  font-size: 28px;
}

.no-evidence__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
  margin-bottom: var(--spacing-8);
}
</style>
