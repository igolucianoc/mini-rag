import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fetchHealth } from '@/api/health';
import type { HealthResponse } from '@/api/health';

/**
 * Store de health da API. Concentra o estado assíncrono (loading/erro/sucesso)
 * do bootstrap para validar o wiring com o backend.
 */
export const useHealthStore = defineStore('health', () => {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const health = ref<HealthResponse | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      health.value = await fetchHealth();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erro desconhecido';
      health.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, health, load };
});
