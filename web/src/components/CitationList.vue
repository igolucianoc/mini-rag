<script setup lang="ts">
/**
 * Lista de citações/fontes de uma resposta RAG. Cada citação é um bloco com a
 * referência [n], o documento de origem e o snippet literal. Acessível: usa uma
 * lista semântica e rótulos textuais (não depende de cor).
 *
 * Aceita tanto RagStreamCitation (streaming) quanto QueryCitationDetail
 * (histórico), que compartilham os campos exibidos.
 */
interface CitationLike {
  readonly rank: number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly score: number;
  readonly snippet: string;
}

withDefaults(
  defineProps<{ citations: readonly CitationLike[]; title?: string }>(),
  { title: 'Fontes' },
);

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
</script>

<template>
  <section v-if="citations.length > 0" class="citations" aria-label="Fontes citadas">
    <h3 class="citations__title">{{ title }}</h3>
    <ol class="citations__list">
      <li v-for="citation in citations" :key="citation.rank" class="citation">
        <div class="citation__head">
          <span class="citation__rank">[{{ citation.rank }}]</span>
          <span class="citation__doc">
            Documento <code>{{ citation.documentId }}</code> · trecho
            {{ citation.chunkIndex }}
          </span>
          <span class="citation__score" :title="`Similaridade ${formatScore(citation.score)}`">
            {{ formatScore(citation.score) }}
          </span>
        </div>
        <blockquote class="citation__snippet">{{ citation.snippet }}</blockquote>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.citations {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
}

.citations__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}

.citations__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
}

.citation {
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-16);
  background: var(--color-paper-white);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.citation__head {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.citation__rank {
  font-weight: var(--font-weight-bold);
  color: var(--color-spark-blue);
}

.citation__doc code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.citation__score {
  margin-left: auto;
  font-weight: var(--font-weight-bold);
  color: var(--color-charcoal);
}

.citation__snippet {
  margin: 0;
  padding-left: var(--spacing-12);
  border-left: 3px solid var(--color-storybook-green);
  color: var(--color-charcoal);
  font-size: var(--text-body);
  line-height: var(--leading-body);
}
</style>
