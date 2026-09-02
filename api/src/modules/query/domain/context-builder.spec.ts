import { describe, it, expect } from 'vitest';
import type { ScoredChunk } from '@/core/rag/domain/rag-types';
import { buildContext } from '../domain/context-builder';

function chunk(
  documentId: string,
  chunkIndex: number,
  content: string,
  score: number,
): ScoredChunk {
  return {
    chunk: {
      documentId,
      chunkIndex,
      content,
      startOffset: 0,
      endOffset: content.length,
      tokenCount: Math.ceil(content.length / 4),
      metadata: {},
    },
    score,
  };
}

describe('buildContext', () => {
  it('numera as fontes [1..n] preservando a ordem e mapeia índice->chunk', () => {
    const chunks = [
      chunk('doc-a', 0, 'primeiro trecho', 0.9),
      chunk('doc-b', 3, 'segundo trecho', 0.8),
    ];

    const built = buildContext(chunks);

    expect(built.text).toContain('[1] primeiro trecho');
    expect(built.text).toContain('[2] segundo trecho');
    expect(built.sources).toHaveLength(2);
    expect(built.sources[0]).toMatchObject({ index: 1 });
    expect(built.sources[0]?.chunk.chunk.documentId).toBe('doc-a');
    expect(built.sources[1]).toMatchObject({ index: 2 });
    expect(built.sources[1]?.chunk.chunk.chunkIndex).toBe(3);
  });

  it('respeita o limite de caracteres, cortando fontes que excedem', () => {
    const chunks = [
      chunk('doc-a', 0, 'A'.repeat(50), 0.9),
      chunk('doc-b', 1, 'B'.repeat(50), 0.8),
      chunk('doc-c', 2, 'C'.repeat(50), 0.7),
    ];

    // maxChars pequeno: cabe apenas a primeira fonte.
    const built = buildContext(chunks, { maxChars: 60 });

    expect(built.sources).toHaveLength(1);
    expect(built.sources[0]?.chunk.chunk.documentId).toBe('doc-a');
    expect(built.text).not.toContain('BBB');
  });

  it('inclui sempre ao menos a primeira fonte mesmo se exceder o limite', () => {
    const chunks = [chunk('doc-a', 0, 'X'.repeat(500), 0.9)];

    const built = buildContext(chunks, { maxChars: 10 });

    expect(built.sources).toHaveLength(1);
    expect(built.text).toContain('[1]');
  });

  it('contexto vazio quando não há chunks', () => {
    const built = buildContext([]);
    expect(built.sources).toHaveLength(0);
    expect(built.text).toBe('');
  });
});
