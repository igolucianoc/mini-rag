<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useHealthStore } from '@/stores/health';

const store = useHealthStore();
const { loading, error, health } = storeToRefs(store);

onMounted(() => {
  void store.load();
});
</script>

<template>
  <main class="home">
    <h1>Mini RAG</h1>
    <section class="health">
      <p v-if="loading" role="status">Verificando API…</p>
      <p v-else-if="error" role="alert" class="error">Erro: {{ error }}</p>
      <dl v-else-if="health" class="status">
        <div>
          <dt>Status</dt>
          <dd>{{ health.status }}</dd>
        </div>
        <div>
          <dt>Banco</dt>
          <dd>{{ health.db }}</dd>
        </div>
      </dl>
      <button type="button" :disabled="loading" @click="store.load">
        Recarregar
      </button>
    </section>
  </main>
</template>

<style scoped>
.home {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: system-ui, sans-serif;
}

.status {
  display: flex;
  gap: 2rem;
}

.error {
  color: #b00020;
}

button {
  margin-top: 1rem;
}
</style>
