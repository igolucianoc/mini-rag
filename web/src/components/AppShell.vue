<script setup lang="ts">
/**
 * Shell da aplicação: topbar com logo/nome, navegação e logout, sobre canvas
 * branco no estilo Duolingo. Nav com <RouterLink> reais (focáveis). O conteúdo
 * roteado entra pelo slot dentro de um <main> com landmark.
 */
import { useRouter, RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import BaseButton from '@/components/BaseButton.vue';

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);
const router = useRouter();

async function onLogout(): Promise<void> {
  await authStore.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="topbar__inner">
        <RouterLink :to="{ name: 'documents' }" class="brand" aria-label="Mini RAG, ir para a biblioteca">
          <span class="brand__mark" aria-hidden="true">🦉</span>
          <span class="brand__name">Mini RAG</span>
        </RouterLink>

        <nav class="nav" aria-label="Navegação principal">
          <RouterLink :to="{ name: 'documents' }" class="nav__link">Biblioteca</RouterLink>
          <RouterLink :to="{ name: 'chat' }" class="nav__link">Perguntar</RouterLink>
          <RouterLink :to="{ name: 'history' }" class="nav__link">Histórico</RouterLink>
        </nav>

        <div class="account">
          <span v-if="user" class="account__email">{{ user.email }}</span>
          <BaseButton variant="secondary" @click="onLogout">Sair</BaseButton>
        </div>
      </div>
    </header>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-paper-white);
}

.topbar {
  border-bottom: 2px solid var(--color-faded-gray);
  background: var(--color-paper-white);
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar__inner {
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: var(--spacing-12) var(--spacing-16);
  display: flex;
  align-items: center;
  gap: var(--spacing-16);
  flex-wrap: wrap;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-8);
  color: var(--color-eager-green);
  font-family: var(--font-feather);
  font-weight: 900;
  font-size: var(--text-heading-sm);
  text-decoration: none;
}

.brand__mark {
  font-size: 28px;
}

.nav {
  display: flex;
  gap: var(--spacing-8);
  flex: 1 1 auto;
}

.nav__link {
  padding: var(--spacing-8) var(--spacing-12);
  border-radius: var(--radius-nav-items);
  color: var(--color-pencil-gray);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-nav-label);
  text-transform: uppercase;
  letter-spacing: var(--tracking-nav-label);
  text-decoration: none;
}

.nav__link:hover {
  background: var(--color-storybook-green);
  text-decoration: none;
}

.nav__link.router-link-active {
  color: var(--color-eager-green);
  background: var(--color-storybook-green);
}

.account {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
}

.account__email {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.content {
  flex: 1 1 auto;
  width: 100%;
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: var(--spacing-24) var(--spacing-16) var(--spacing-64);
}

@media (max-width: 640px) {
  .account__email {
    display: none;
  }

  .nav {
    order: 3;
    width: 100%;
    justify-content: space-between;
  }

  .nav__link {
    padding: var(--spacing-8);
  }
}
</style>
