/**
 * Cliente mínimo do endpoint de health da API.
 * Passa pelo proxy do Vite (/api -> http://localhost:3000).
 */

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  timestamp: string;
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.status === 'ok' || candidate.status === 'degraded') &&
    (candidate.db === 'up' || candidate.db === 'down') &&
    typeof candidate.timestamp === 'string'
  );
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`Falha ao consultar health: HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!isHealthResponse(data)) {
    throw new Error('Resposta de health em formato inesperado');
  }
  return data;
}
