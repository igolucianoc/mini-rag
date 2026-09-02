import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LoginView from '@/views/LoginView.vue';

const pushMock = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ query: {} }),
}));

/** Response JSON simulado. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function mountView() {
  setActivePinia(createPinia());
  return mount(LoginView);
}

describe('LoginView', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mostra erros de validação e não dispara requisição em submit inválido', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountView();
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Informe seu e-mail.');
    expect(wrapper.text()).toContain('Informe sua senha.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('faz login e redireciona quando os dados são válidos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, { accessToken: 'tkn' }))),
    );

    const wrapper = mountView();
    await wrapper.find('#email').setValue('user@example.com');
    await wrapper.find('#password').setValue('supersecret');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(pushMock).toHaveBeenCalled();
  });

  it('exige senha de 8+ caracteres no modo registro', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountView();
    const toggle = wrapper.findAll('button').find((b) => b.text() === 'Criar conta');
    await toggle?.trigger('click');
    await wrapper.find('#email').setValue('user@example.com');
    await wrapper.find('#password').setValue('short');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('A senha deve ter ao menos 8 caracteres.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
