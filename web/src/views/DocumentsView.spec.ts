import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DocumentsView from '@/views/DocumentsView.vue';
import type { DocumentListItem } from '@/types/api';

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

const sampleDoc: DocumentListItem = {
  id: 'doc-1',
  title: 'Guia de Onboarding',
  status: 'READY',
  sourceType: 'MARKDOWN',
  originalFilename: 'onboarding.md',
  mimeType: 'text/markdown',
  sizeBytes: 1024,
  chunkCount: 7,
  createdAt: '2024-05-01T12:00:00Z',
};

function mountView() {
  setActivePinia(createPinia());
  return mount(DocumentsView);
}

describe('DocumentsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza a lista de documentos após o carregamento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, [sampleDoc]))),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Guia de Onboarding');
    expect(wrapper.text()).toContain('7 trecho(s)');
    expect(wrapper.text()).toContain('Pronto');
  });

  it('mostra o empty state quando não há documentos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, []))),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Nenhum documento ainda');
  });

  it('mostra erro e permite tentar de novo', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }))
      .mockResolvedValueOnce(jsonResponse(200, [sampleDoc]));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountView();
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(wrapper.text()).toContain('Não foi possível carregar seus documentos');

    // Clica em "Tentar de novo".
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Tentar de novo');
    await retry?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Guia de Onboarding');
  });
});
