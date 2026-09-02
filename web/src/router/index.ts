import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** Rota exige sessão autenticada. */
    requiresAuth?: boolean;
    /** Rota só para visitantes (redireciona autenticados). */
    guestOnly?: boolean;
  }
}

/**
 * Rotas com lazy loading (import dinâmico) para as views não críticas. Rotas
 * protegidas usam meta.requiresAuth; a rota de login usa meta.guestOnly.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/',
    name: 'documents',
    component: () => import('@/views/DocumentsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'documents' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * Guard de autenticação. Como o access token vive só em memória, ao dar F5 a
 * reidratação (bootstrap = tentativa de refresh via cookie) roda no main.ts
 * antes de montar; aqui, garantimos que a tentativa concluiu antes de decidir.
 */
router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (authStore.initializing) {
    await authStore.bootstrap();
  }

  if (to.meta.requiresAuth === true && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.guestOnly === true && authStore.isAuthenticated) {
    return { name: 'documents' };
  }

  return true;
});
