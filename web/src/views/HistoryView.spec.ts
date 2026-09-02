import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import HistoryView from '@/views/HistoryView.vue';
import type { QueryListItem } from '@/types/api';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

const sampleItem: QueryListItem = {
  id: 'q-1',
  question: 'O que são embeddings?',
  answer: 'Vetores densos.',
  hadSufficientEvidence: true,
  modelId: 'meta-llama/Llama-3.1-8B-Instruct',
  latencyMs: 1200,
  createdAt: '2024-05-01T12:00:00Z',
};

function mountView() {
  setActivePinia(createPinia());
  return mount(HistoryView);
}

function findButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button').find((b) => b.text() === label);
}

describe('HistoryView — limpar histórico', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('não mostra o botão de limpar quando o histórico está vazio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, []))),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Nenhuma pergunta ainda');
    expect(findButton(wrapper, 'Limpar histórico')).toBeUndefined();
  });

  it('confirmando no diálogo, chama DELETE /api/queries e esvazia a lista', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [sampleItem])) // load inicial
      .mockResolvedValueOnce(jsonResponse(204, {})); // delete-all
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('O que são embeddings?');

    // 1. Clicar no botão do header apenas ABRE o diálogo (não dispara DELETE).
    await findButton(wrapper, 'Limpar histórico')?.trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. Confirmar no diálogo dispara o DELETE.
    await findButton(wrapper, 'Limpar tudo')?.trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall).toBeDefined();
    const [url, init] = deleteCall ?? [];
    expect(url instanceof URL ? url.pathname : url).toContain('/queries');
    expect(init?.method).toBe('DELETE');

    // Lista esvaziada -> volta ao empty state.
    expect(wrapper.text()).toContain('Nenhuma pergunta ainda');
  });

  it('cancelando no diálogo, não chama o DELETE', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [sampleItem]));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, 'Limpar histórico')?.trigger('click');
    await flushPromises();

    await findButton(wrapper, 'Cancelar')?.trigger('click');
    await flushPromises();

    // Só o load inicial: nenhum DELETE disparado.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('O que são embeddings?');
  });
});
