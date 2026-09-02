<script setup lang="ts">
/**
 * Histórico de perguntas. Lista (GET /api/queries); ao selecionar um item,
 * carrega o detalhe (GET /api/queries/:id) com resposta e citações. Estados
 * loading/empty/error para lista e para o detalhe.
 */
import { onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@/stores/chat';
import AppShell from '@/components/AppShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import StateMessage from '@/components/StateMessage.vue';
import LoadingSkeleton from '@/components/LoadingSkeleton.vue';
import CitationList from '@/components/CitationList.vue';

const chatStore = useChatStore();
const {
  history,
  historyLoading,
  historyError,
  detail,
  detailLoading,
  detailError,
} = storeToRefs(chatStore);

const selectedId = ref<string | null>(null);

onMounted(() => {
  void chatStore.loadHistory();
});

async function onSelect(id: string): Promise<void> {
  selectedId.value = id;
  await chatStore.loadDetail(id);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('pt-BR');
}
</script>

<template>
  <AppShell>
    <h1 class="title">Histórico</h1>
    <p class="subtitle">Suas perguntas anteriores e as respostas geradas.</p>

    <LoadingSkeleton v-if="historyLoading" :lines="4" label="Carregando histórico…" />

    <StateMessage
      v-else-if="historyError"
      variant="error"
      icon="⚠"
      title="Não foi possível carregar o histórico"
      :description="historyError"
    >
      <template #action>
        <BaseButton variant="primary" @click="chatStore.loadHistory">Tentar de novo</BaseButton>
      </template>
    </StateMessage>

    <StateMessage
      v-else-if="history.length === 0"
      variant="empty"
      icon="💬"
      title="Nenhuma pergunta ainda"
      description="Faça uma pergunta na aba Perguntar para começar seu histórico."
    />

    <div v-else class="layout">
      <ul class="qlist" aria-label="Perguntas anteriores">
        <li v-for="item in history" :key="item.id">
          <button
            type="button"
            class="qitem"
            :class="{ 'qitem--active': selectedId === item.id }"
            :aria-pressed="selectedId === item.id"
            @click="onSelect(item.id)"
          >
            <span class="qitem__q">{{ item.question }}</span>
            <span class="qitem__date">{{ formatDate(item.createdAt) }}</span>
          </button>
        </li>
      </ul>

      <section class="detail" aria-live="polite">
        <LoadingSkeleton v-if="detailLoading" :lines="3" label="Carregando resposta…" />

        <StateMessage
          v-else-if="detailError"
          variant="error"
          icon="⚠"
          title="Não foi possível carregar a resposta"
          :description="detailError"
        />

        <template v-else-if="detail">
          <h2 class="detail__q">{{ detail.question }}</h2>
          <p v-if="!detail.hadSufficientEvidence" class="detail__no-evidence">
            <span aria-hidden="true">🤷 </span>Sem evidência suficiente nos documentos.
          </p>
          <p class="detail__answer">{{ detail.answer ?? 'Sem resposta registrada.' }}</p>
          <CitationList :citations="detail.citations" />
        </template>

        <p v-else class="detail__hint">Selecione uma pergunta para ver a resposta.</p>
      </section>
    </div>
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

.layout {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 2fr;
  gap: var(--spacing-24);
  align-items: start;
}

.qlist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.qitem {
  width: 100%;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--spacing-12);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  background: var(--color-paper-white);
  font-family: var(--font-duolingo-sans);
}

.qitem--active {
  border-color: var(--color-eager-green);
  background: var(--color-storybook-green);
}

.qitem__q {
  font-weight: var(--font-weight-bold);
  color: var(--color-charcoal);
}

.qitem__date {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.detail {
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-24);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  min-height: 160px;
}

.detail__q {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}

.detail__no-evidence {
  color: var(--color-spark-blue);
  font-weight: var(--font-weight-bold);
}

.detail__answer {
  color: var(--color-charcoal);
  line-height: 1.5;
  white-space: pre-wrap;
}

.detail__hint {
  color: var(--color-pencil-gray);
}

@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
