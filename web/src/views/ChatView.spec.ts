import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatView from '@/views/ChatView.vue';
import type { AskRequest, RagStreamEvent } from '@/types/api';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
}));

// Controla os eventos emitidos pelo streaming em cada teste.
const streamScript = { events: [] as RagStreamEvent[] };

vi.mock('@/services/queries', () => ({
  StreamTransportError: class extends Error {},
  streamQuery: vi.fn(
    (_request: AskRequest, onEvent: (event: RagStreamEvent) => void): Promise<void> => {
      for (const event of streamScript.events) {
        onEvent(event);
      }
      return Promise.resolve();
    },
  ),
  listQueries: vi.fn(() => Promise.resolve([])),
  getQuery: vi.fn(),
  ask: vi.fn(),
  buildStreamQuery: vi.fn(() => ''),
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

async function ask(wrapper: ReturnType<typeof mount>, question: string): Promise<void> {
  await wrapper.find('#question').setValue(question);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

function mountView() {
  setActivePinia(createPinia());
  // A ChatView carrega documentos (lista vazia) no onMounted.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, []))),
  );
  return mount(ChatView);
}

describe('ChatView (streaming RAG)', () => {
  beforeEach(() => {
    streamScript.events = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza os tokens incrementais e as citações da resposta', async () => {
    streamScript.events = [
      { type: 'started' },
      { type: 'retrieving' },
      {
        type: 'context_ready',
        sources: [
          { index: 1, documentId: 'doc-1', chunkIndex: 0, score: 0.9, snippet: 'trecho base' },
        ],
      },
      { type: 'token', text: 'A resposta ' },
      { type: 'token', text: 'é 42.' },
      {
        type: 'completed',
        result: {
          queryId: 'q1',
          answer: 'A resposta é 42.',
          hadSufficientEvidence: true,
          modelId: 'gpt',
          latencyMs: 12,
          citations: [
            { rank: 1, documentId: 'doc-1', chunkIndex: 0, score: 0.9, snippet: 'trecho base' },
          ],
        },
      },
    ];

    const wrapper = mountView();
    await flushPromises();
    await ask(wrapper, 'Qual a resposta?');

    expect(wrapper.text()).toContain('A resposta é 42.');
    // Bloco de fontes/citações.
    expect(wrapper.text()).toContain('Fontes');
    expect(wrapper.text()).toContain('[1]');
    expect(wrapper.text()).toContain('trecho base');
  });

  it('destaca o estado "sem evidência suficiente"', async () => {
    streamScript.events = [
      { type: 'started' },
      { type: 'retrieving' },
      {
        type: 'completed',
        result: {
          queryId: 'q2',
          answer: 'Não encontrei base para responder.',
          hadSufficientEvidence: false,
          modelId: null,
          latencyMs: 5,
          citations: [],
        },
      },
    ];

    const wrapper = mountView();
    await flushPromises();
    await ask(wrapper, 'Pergunta sem base');

    expect(wrapper.text()).toContain('Sem evidência suficiente');
    expect(wrapper.text()).toContain('Não encontrei base para responder.');
  });

  it('mostra estado de erro quando o stream emite failed', async () => {
    streamScript.events = [
      { type: 'started' },
      { type: 'failed', message: 'Falha no provedor' },
    ];

    const wrapper = mountView();
    await flushPromises();
    await ask(wrapper, 'Pergunta que falha');

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(wrapper.text()).toContain('Falha no provedor');
    expect(wrapper.text()).toContain('Tentar de novo');
  });
});
