/**
 * Serviço de documentos. Upload é multipart: o campo do arquivo é 'file'
 * (confirmado no FileInterceptor('file') do documents.controller.ts do backend).
 */
import { apiRequest } from '@/services/client';
import type { DocumentListItem, UploadResponse } from '@/types/api';

export function listDocuments(signal?: AbortSignal): Promise<DocumentListItem[]> {
  return apiRequest<DocumentListItem[]>('/documents', { signal });
}

export function getDocument(id: string): Promise<DocumentListItem> {
  return apiRequest<DocumentListItem>(`/documents/${id}`);
}

/** Envia um arquivo (MD/TXT/PDF) com título opcional. Campo do arquivo: 'file'. */
export function uploadDocument(file: File, title?: string): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (title !== undefined && title.trim().length > 0) {
    formData.append('title', title.trim());
  }
  return apiRequest<UploadResponse>('/documents', { method: 'POST', formData });
}

export function deleteDocument(id: string): Promise<void> {
  return apiRequest<void>(`/documents/${id}`, { method: 'DELETE' });
}
