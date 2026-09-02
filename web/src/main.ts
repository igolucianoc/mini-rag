import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth';
import '@/assets/tokens.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  app.use(createPinia());

  // Reidrata a sessão via cookie (F5) ANTES de montar o router, para o guard
  // decidir a rota já com o resultado do refresh. O access token só vive em
  // memória, então sem essa tentativa um F5 sempre cairia no login.
  const authStore = useAuthStore();
  await authStore.bootstrap();

  app.use(router);
  app.mount('#app');
}

void bootstrap();
