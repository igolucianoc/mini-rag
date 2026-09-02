<script setup lang="ts">
/**
 * Biblioteca de documentos. Estados: loading (skeleton), error (+retry),
 * empty (CTA de upload) e success (lista com status/chunkCount/data). O upload
 * é feito por um diálogo acessível reutilizando a store de documents.
 */
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDocumentsStore } from '@/stores/documents';
import AppShell from '@/components/AppShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import StateMessage from '@/components/StateMessage.vue';
import LoadingSkeleton from '@/components/LoadingSkeleton.vue';
import DocumentUpload from '@/components/DocumentUpload.vue';

const documentsStore = useDocumentsStore();
const { items, loading, error, isEmpty } = storeToRefs(documentsStore);

const uploadOpen = ref(false);
const removingId = ref<string | null>(null);

const hasItems = computed(() => items.value.length > 0);

onMounted(() => {
  void documentsStore.load();
});

function openUpload(): void {
  uploadOpen.value = true;
}

function closeUpload(): void {
  uploadOpen.value = false;
}

async function onRemove(id: string): Promise<void> {
  removingId.value = id;
  try {
    await documentsStore.remove(id);
  } finally {
    removingId.value = null;
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('pt-BR');
}
</script>

<template>
  <AppShell>
    <div class="header">
      <div>
        <h1 class="header__title">Biblioteca</h1>
        <p class="header__subtitle">Seus documentos indexados para consulta.</p>
      </div>
      <BaseButton v-if="hasItems" variant="primary" @click="openUpload">
        Enviar documento
      </BaseButton>
    </div>

    <LoadingSkeleton v-if="loading" :lines="4" label="Carregando documentos…" />

    <StateMessage
      v-else-if="error"
      variant="error"
      icon="⚠"
      title="Não foi possível carregar seus documentos"
      :description="error"
    >
      <template #action>
        <BaseButton variant="primary" @click="documentsStore.load">Tentar de novo</BaseButton>
      </template>
    </StateMessage>

    <StateMessage
      v-else-if="isEmpty"
      variant="empty"
      icon="📚"
      title="Nenhum documento ainda"
      description="Envie um arquivo Markdown, TXT ou PDF para começar a fazer perguntas."
    >
      <template #action>
        <BaseButton variant="primary" @click="openUpload">Enviar documento</BaseButton>
      </template>
    </StateMessage>

    <ul v-else class="doc-list">
      <li v-for="doc in items" :key="doc.id" class="doc">
        <div class="doc__main">
          <h2 class="doc__title">{{ doc.title }}</h2>
          <p class="doc__meta">
            <span>{{ doc.sourceType }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ doc.chunkCount }} trecho(s)</span>
            <span aria-hidden="true">·</span>
            <span>{{ formatDate(doc.createdAt) }}</span>
          </p>
        </div>
        <div class="doc__side">
          <StatusBadge :status="doc.status" />
          <BaseButton
            variant="ghost"
            :disabled="removingId === doc.id"
            @click="onRemove(doc.id)"
          >
            {{ removingId === doc.id ? 'Removendo…' : 'Remover' }}
          </BaseButton>
        </div>
      </li>
    </ul>

    <DocumentUpload :open="uploadOpen" @close="closeUpload" @uploaded="closeUpload" />
  </AppShell>
</template>

<style scoped>
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-16);
  margin-bottom: var(--spacing-24);
  flex-wrap: wrap;
}

.header__title {
  font-family: var(--font-feather);
  font-weight: 900;
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
}

.header__subtitle {
  color: var(--color-pencil-gray);
}

.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
}

.doc {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-16) var(--spacing-24);
  flex-wrap: wrap;
}

.doc__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}

.doc__meta {
  display: flex;
  gap: var(--spacing-8);
  flex-wrap: wrap;
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.doc__side {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
}
</style>
