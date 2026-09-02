/**
 * Parser puro do protocolo SSE (Server-Sent Events) usado pelo streaming RAG.
 *
 * O backend expõe GET /api/queries/stream como text/event-stream, mas exige
 * header Authorization Bearer — logo NÃO dá para usar EventSource nativo (que
 * não envia headers). Consumimos via fetch streaming (ReadableStream) e fazemos
 * o parse manual aqui.
 *
 * Protocolo: eventos separados por linha em branco; cada evento tem uma ou mais
 * linhas `data: <conteúdo>`. Concatenamos as linhas `data:` de um mesmo evento
 * com "\n" (conforme a spec) e interpretamos o resultado como JSON de
 * RagStreamEvent. Linhas de comentário (começando com ":") e campos não-`data`
 * (event/id/retry) são ignorados — só precisamos do payload JSON.
 *
 * A função é PURA e stateless por chamada: recebe um buffer acumulado e devolve
 * os eventos completos + o resto ainda não terminado, para ser chamada em loop
 * conforme os chunks chegam do reader.
 */
import type { RagStreamEvent } from '@/types/api';

/** Resultado de um passo de parse incremental. */
export interface SseParseResult {
  /** Eventos completos extraídos neste passo. */
  readonly events: readonly RagStreamEvent[];
  /** Texto restante (evento ainda não terminado) para o próximo passo. */
  readonly rest: string;
}

/**
 * Faz o parse de um buffer SSE acumulado, extraindo os eventos completos
 * (blocos terminados por linha em branco) e devolvendo o resto pendente.
 */
export function parseSseBuffer(buffer: string): SseParseResult {
  // Normaliza CRLF -> LF para separar blocos de forma consistente.
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  // O último elemento é o bloco potencialmente incompleto: vira o "rest".
  const rest = blocks.pop() ?? '';

  const events: RagStreamEvent[] = [];
  for (const block of blocks) {
    const payload = extractDataPayload(block);
    if (payload === null) {
      continue;
    }
    const event = parseEventJson(payload);
    if (event !== null) {
      events.push(event);
    }
  }

  return { events, rest };
}

/**
 * Conveniência para testes e usos batch: parseia um texto SSE completo e
 * devolve todos os eventos válidos (ignora o resto pendente).
 */
export function parseSseText(text: string): RagStreamEvent[] {
  // Garante que o último bloco também seja processado, acrescentando o
  // separador de fim de evento.
  const result = parseSseBuffer(`${text}\n\n`);
  return [...result.events];
}

/** Concatena as linhas `data:` de um bloco; null se o bloco não tiver payload. */
function extractDataPayload(block: string): string | null {
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimStart();
    if (line.length === 0 || line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('data:')) {
      // Remove o prefixo "data:" e um único espaço opcional após ele.
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return dataLines.join('\n');
}

/** Parseia o JSON de um payload e valida a forma de RagStreamEvent. */
function parseEventJson(payload: string): RagStreamEvent | null {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return isRagStreamEvent(value) ? value : null;
}

/** Type guard: valor desconhecido é um RagStreamEvent bem-formado. */
export function isRagStreamEvent(value: unknown): value is RagStreamEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case 'started':
    case 'retrieving':
      return true;
    case 'token':
      return typeof record.text === 'string';
    case 'failed':
      return typeof record.message === 'string';
    case 'context_ready':
      return Array.isArray(record.sources);
    case 'source':
      return typeof record.source === 'object' && record.source !== null;
    case 'completed':
      return typeof record.result === 'object' && record.result !== null;
    default:
      return false;
  }
}
