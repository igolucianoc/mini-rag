import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import HomeView from '@/views/HomeView.vue';
import type { HealthResponse } from '@/api/health';

function mockFetchOk(body: HealthResponse): void {
  const response = {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));
}

function mockFetchHttpError(status: number): void {
  const response = {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as Response;
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));
}

describe('HomeView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mostra o status quando a API responde ok', async () => {
    setActivePinia(createPinia());
    mockFetchOk({ status: 'ok', db: 'up', timestamp: '2024-01-01T00:00:00Z' });

    const wrapper = mount(HomeView);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('ok');
    expect(wrapper.text()).toContain('up');
  });

  it('mostra mensagem de erro quando a API falha', async () => {
    setActivePinia(createPinia());
    mockFetchHttpError(500);

    const wrapper = mount(HomeView);
    await flushPromises();

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('HTTP 500');
  });
});
