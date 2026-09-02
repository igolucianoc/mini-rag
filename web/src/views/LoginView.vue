<script setup lang="ts">
/**
 * Tela de login/registro. Formulário acessível (labels associadas, aria-invalid,
 * mensagens de erro com role), validação client-side mínima, alterna entre
 * login e registro. Em sucesso, redireciona para a biblioteca (ou ?redirect).
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import BaseButton from '@/components/BaseButton.vue';

type Mode = 'login' | 'register';

const authStore = useAuthStore();
const { loading, error } = storeToRefs(authStore);
const router = useRouter();
const route = useRoute();

const mode = ref<Mode>('login');
const email = ref('');
const password = ref('');
const submitted = ref(false);

const emailError = computed<string | null>(() => {
  if (!submitted.value) {
    return null;
  }
  if (email.value.trim().length === 0) {
    return 'Informe seu e-mail.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    return 'E-mail inválido.';
  }
  return null;
});

const passwordError = computed<string | null>(() => {
  if (!submitted.value) {
    return null;
  }
  if (password.value.length === 0) {
    return 'Informe sua senha.';
  }
  if (mode.value === 'register' && password.value.length < 8) {
    return 'A senha deve ter ao menos 8 caracteres.';
  }
  return null;
});

const isValid = computed(() => emailError.value === null && passwordError.value === null);

const title = computed(() => (mode.value === 'login' ? 'Entrar' : 'Criar conta'));
const submitLabel = computed(() => (mode.value === 'login' ? 'Entrar' : 'Cadastrar'));
const togglePrompt = computed(() =>
  mode.value === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?',
);
const toggleLabel = computed(() => (mode.value === 'login' ? 'Criar conta' : 'Entrar'));

function toggleMode(): void {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  submitted.value = false;
}

async function onSubmit(): Promise<void> {
  submitted.value = true;
  if (!isValid.value) {
    return;
  }
  const credentials = { email: email.value.trim(), password: password.value };
  const ok =
    mode.value === 'login'
      ? await authStore.login(credentials)
      : await authStore.register(credentials);

  if (ok) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    await router.push(redirect ?? { name: 'documents' });
  }
}
</script>

<template>
  <main class="auth">
    <section class="card">
      <h1 class="card__title">{{ title }}</h1>
      <p class="card__subtitle">Sua base de conhecimento com respostas fundamentadas.</p>

      <form class="form" novalidate @submit.prevent="onSubmit">
        <div class="field">
          <label class="field__label" for="email">E-mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            class="field__input"
            :aria-invalid="emailError !== null"
            :aria-describedby="emailError ? 'email-error' : undefined"
          />
          <p v-if="emailError" id="email-error" class="field__error" role="alert">
            {{ emailError }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="password">Senha</label>
          <input
            id="password"
            v-model="password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            class="field__input"
            :aria-invalid="passwordError !== null"
            :aria-describedby="passwordError ? 'password-error' : undefined"
          />
          <p v-if="passwordError" id="password-error" class="field__error" role="alert">
            {{ passwordError }}
          </p>
        </div>

        <p v-if="error" class="form__error" role="alert">
          <span aria-hidden="true">⚠ </span>{{ error }}
        </p>

        <BaseButton type="submit" variant="primary" block :disabled="loading">
          {{ loading ? 'Enviando…' : submitLabel }}
        </BaseButton>
      </form>

      <p class="toggle">
        {{ togglePrompt }}
        <BaseButton variant="ghost" @click="toggleMode">{{ toggleLabel }}</BaseButton>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-24) var(--spacing-16);
  background: var(--surface-paper-white);
}

.card {
  width: 100%;
  max-width: 420px;
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-32);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.card__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
}

.card__subtitle {
  color: var(--color-pencil-gray);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
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

.field__input {
  padding: var(--spacing-12);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  font-size: var(--text-body);
  font-family: var(--font-duolingo-sans);
  color: var(--color-charcoal);
}

.field__input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.field__error,
.form__error {
  color: var(--color-error);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-bold);
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-8);
  color: var(--color-pencil-gray);
  font-size: var(--text-caption);
}
</style>
