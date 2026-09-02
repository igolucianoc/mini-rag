/**
 * Store do chat RAG. Orquestra o streaming SSE (via fetch) acumulando os tokens
 * incrementalmente, as fontes do contexto e as citações, além de expor o estado
 * final (respondida / sem evidência / falha). Também guarda o histórico.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as queriesApi from '@/api/queries';
import { StreamTransportError } from '@/api/queries';
import { ApiError } from '@/api/client';
import type {
  AskRequest,
  QueryDetail,
  QueryListItem,
  RagStreamCitation,
  RagStreamCompleted,
  RagStreamContextSource,
  RagStreamEvent,
} from '@/types/api';

/** Fase do fluxo de streaming, para a UI escolher o que mostrar. */
export type StreamPhase = 'idle' | 'starting' | 'retrieving' | 'streaming' | 'done' | 'error';

export const useChatStore = defineStore('chat', () => {
  // --- Estado do streaming atual ---
  const phase = ref<StreamPhase>('idle');
  const question = ref('');
  const answerText = ref('');
  const contextSources = ref<RagStreamContextSource[]>([]);
  const citations = ref<RagStreamCitation[]>([]);
  const completed = ref<RagStreamCompleted | null>(null);
  const streamError = ref<string | null>(null);

  // --- Histórico ---
  const history = ref<QueryListItem[]>([]);
  const historyLoading = ref(false);
  const historyError = ref<string | null>(null);
  const clearingHistory = ref(false);
  const detail = ref<QueryDetail | null>(null);
  const detailLoading = ref(false);
  const detailError = ref<string | null>(null);

  let abortController: AbortController | null = null;

  const isStreaming = computed(
    () => phase.value === 'starting' || phase.value === 'retrieving' || phase.value === 'streaming',
  );
  const hasNoEvidence = computed(
    () => completed.value !== null && completed.value.hadSufficientEvidence === false,
  );

  function resetCurrent(): void {
    answerText.value = '';
    contextSources.value = [];
    citations.value = [];
    completed.value = null;
    streamError.value = null;
  }

  function applyEvent(event: RagStreamEvent): void {
    switch (event.type) {
      case 'started':
        phase.value = 'starting';
        break;
      case 'retrieving':
        phase.value = 'retrieving';
        break;
      case 'context_ready':
        contextSources.value = [...event.sources];
        phase.value = 'streaming';
        break;
      case 'token':
        answerText.value += event.text;
        phase.value = 'streaming';
        break;
      case 'source':
        citations.value = [...citations.value, event.source];
        break;
      case 'completed':
        completed.value = event.result;
        answerText.value = event.result.answer;
        citations.value = [...event.result.citations];
        phase.value = 'done';
        break;
      case 'failed':
        streamError.value = event.message;
        phase.value = 'error';
        break;
    }
  }

  /** Inicia uma pergunta via streaming SSE. Cancela um stream anterior em curso. */
  async function askStream(request: AskRequest): Promise<void> {
    cancel();
    resetCurrent();
    question.value = request.question;
    phase.value = 'starting';

    const controller = new AbortController();
    abortController = controller;

    try {
      await queriesApi.streamQuery(request, applyEvent, controller.signal);
      // Se o stream terminou sem `completed` nem `failed`, marca erro defensivo.
      if (completed.value === null && streamError.value === null) {
        streamError.value = 'O streaming terminou de forma inesperada.';
        phase.value = 'error';
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return; // cancelamento intencional: não é erro para a UI
      }
      streamError.value = toStreamMessage(err);
      phase.value = 'error';
    } finally {
      if (abortController === controller) {
        abortController = null;
      }
    }
  }

  /** Cancela o streaming em andamento (se houver). */
  function cancel(): void {
    if (abortController !== null) {
      abortController.abort();
      abortController = null;
    }
  }

  /** Limpa o estado para uma nova pergunta. */
  function reset(): void {
    cancel();
    phase.value = 'idle';
    question.value = '';
    resetCurrent();
  }

  async function loadHistory(): Promise<void> {
    historyLoading.value = true;
    historyError.value = null;
    try {
      history.value = await queriesApi.listQueries();
    } catch (err) {
      historyError.value = toMessage(err);
    } finally {
      historyLoading.value = false;
    }
  }

  async function loadDetail(id: string): Promise<void> {
    detailLoading.value = true;
    detailError.value = null;
    detail.value = null;
    try {
      detail.value = await queriesApi.getQuery(id);
    } catch (err) {
      detailError.value = toMessage(err);
    } finally {
      detailLoading.value = false;
    }
  }

  /**
   * Apaga todo o histórico do usuário. Em sucesso, zera a lista e o detalhe
   * localmente. Retorna true/false para a view reagir (ex.: fechar confirmação).
   */
  async function clearHistory(): Promise<boolean> {
    clearingHistory.value = true;
    historyError.value = null;
    try {
      await queriesApi.deleteAllQueries();
      history.value = [];
      detail.value = null;
      return true;
    } catch (err) {
      historyError.value = toMessage(err);
      return false;
    } finally {
      clearingHistory.value = false;
    }
  }

  return {
    phase,
    question,
    answerText,
    contextSources,
    citations,
    completed,
    streamError,
    isStreaming,
    hasNoEvidence,
    history,
    historyLoading,
    historyError,
    clearingHistory,
    detail,
    detailLoading,
    detailError,
    applyEvent,
    askStream,
    cancel,
    reset,
    loadHistory,
    loadDetail,
    clearHistory,
  };
});

function toStreamMessage(err: unknown): string {
  if (err instanceof StreamTransportError) {
    if (err.status === 401) {
      return 'Sua sessão expirou. Faça login novamente.';
    }
    return err.message;
  }
  return 'A conexão de streaming falhou. Tente novamente.';
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return 'Não foi possível carregar. Tente novamente.';
}
