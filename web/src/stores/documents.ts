/**
 * Store de documentos: lista, upload e remoção. Concentra o estado assíncrono
 * (loading/erro) e serve as telas de biblioteca e upload.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as documentsApi from '@/services/documents';
import { ApiError } from '@/services/client';
import type { DocumentListItem, UploadResponse } from '@/types/api';

export const useDocumentsStore = defineStore('documents', () => {
  const items = ref<DocumentListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const uploading = ref(false);
  const uploadError = ref<string | null>(null);

  const isEmpty = computed(() => !loading.value && error.value === null && items.value.length === 0);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      items.value = await documentsApi.listDocuments();
    } catch (err) {
      error.value = toMessage(err);
    } finally {
      loading.value = false;
    }
  }

  /** Envia um arquivo; em sucesso recarrega a lista. Retorna o resultado ou null. */
  async function upload(file: File, title?: string): Promise<UploadResponse | null> {
    uploading.value = true;
    uploadError.value = null;
    try {
      const result = await documentsApi.uploadDocument(file, title);
      await load();
      return result;
    } catch (err) {
      uploadError.value = toMessage(err);
      return null;
    } finally {
      uploading.value = false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    error.value = null;
    try {
      await documentsApi.deleteDocument(id);
      items.value = items.value.filter((doc) => doc.id !== id);
      return true;
    } catch (err) {
      error.value = toMessage(err);
      return false;
    }
  }

  function clearUploadError(): void {
    uploadError.value = null;
  }

  return {
    items,
    loading,
    error,
    uploading,
    uploadError,
    isEmpty,
    load,
    upload,
    remove,
    clearUploadError,
  };
});

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}
