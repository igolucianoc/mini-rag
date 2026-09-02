import { describe, expect, it } from 'vitest';
import { parseSseBuffer, parseSseText } from '@/api/sse';
import type { RagStreamEvent } from '@/types/api';

describe('parseSseText', () => {
  it('parseia uma sequência de eventos SSE (started, token, completed)', () => {
    const stream = [
      'data: {"type":"started"}',
      '',
      'data: {"type":"retrieving"}',
      '',
      'data: {"type":"token","text":"Olá "}',
      '',
      'data: {"type":"token","text":"mundo"}',
      '',
      'data: {"type":"completed","result":{"queryId":"q1","answer":"Olá mundo","hadSufficientEvidence":true,"modelId":"m","latencyMs":10,"citations":[]}}',
      '',
    ].join('\n');

    const events = parseSseText(stream);

    expect(events.map((e) => e.type)).toEqual([
      'started',
      'retrieving',
      'token',
      'token',
      'completed',
    ]);
    const tokens = events.filter((e): e is Extract<RagStreamEvent, { type: 'token' }> => e.type === 'token');
    expect(tokens.map((t) => t.text).join('')).toBe('Olá mundo');
  });

  it('parseia o evento failed', () => {
    const events = parseSseText('data: {"type":"failed","message":"deu ruim"}\n\n');
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toEqual({ type: 'failed', message: 'deu ruim' });
  });

  it('ignora linhas de comentário e payloads inválidos', () => {
    const stream = [
      ': keep-alive',
      '',
      'data: not-json',
      '',
      'data: {"type":"desconhecido"}',
      '',
      'data: {"type":"token","text":"ok"}',
      '',
    ].join('\n');

    const events = parseSseText(stream);
    expect(events).toEqual([{ type: 'token', text: 'ok' }]);
  });
});

describe('parseSseBuffer (incremental)', () => {
  it('mantém o evento incompleto no rest e o completa no próximo chunk', () => {
    const first = parseSseBuffer('data: {"type":"token","text":"par');
    expect(first.events).toHaveLength(0);
    expect(first.rest).toContain('data: {"type":"token"');

    const second = parseSseBuffer(`${first.rest}cial"}\n\n`);
    expect(second.events).toEqual([{ type: 'token', text: 'parcial' }]);
    expect(second.rest).toBe('');
  });

  it('concatena múltiplas linhas data: do mesmo evento com \\n', () => {
    // Payload JSON quebrado em duas linhas data: — a spec manda juntar com \n.
    const { events } = parseSseBuffer('data: {"type":"token",\ndata: "text":"x"}\n\n');
    expect(events).toEqual([{ type: 'token', text: 'x' }]);
  });
});
