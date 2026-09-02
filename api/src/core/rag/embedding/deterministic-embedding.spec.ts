import { describe, expect, it } from 'vitest';
import {
  FAKE_EMBEDDING_DIMENSIONS,
  fakeDeterministicEmbedding,
  toPgVectorLiteral,
} from '../../../core/rag/embedding/deterministic-embedding';

describe('fakeDeterministicEmbedding', () => {
  it('produz a dimensão default (384)', () => {
    const vector = fakeDeterministicEmbedding('qualquer texto');
    expect(vector).toHaveLength(FAKE_EMBEDDING_DIMENSIONS);
  });

  it('respeita dimensão custom', () => {
    expect(fakeDeterministicEmbedding('texto', 16)).toHaveLength(16);
  });

  it('é determinístico: mesmo texto => mesmo vetor', () => {
    const a = fakeDeterministicEmbedding('RAG com pgvector');
    const b = fakeDeterministicEmbedding('RAG com pgvector');
    expect(a).toEqual(b);
  });

  it('textos diferentes produzem vetores diferentes', () => {
    const a = fakeDeterministicEmbedding('texto um');
    const b = fakeDeterministicEmbedding('texto dois');
    expect(a).not.toEqual(b);
  });

  it('é normalizado (norma L2 ~ 1)', () => {
    const vector = fakeDeterministicEmbedding('normalização L2');
    const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it('rejeita dimensão inválida', () => {
    expect(() => fakeDeterministicEmbedding('x', 0)).toThrow();
    expect(() => fakeDeterministicEmbedding('x', -1)).toThrow();
    expect(() => fakeDeterministicEmbedding('x', 1.5)).toThrow();
  });
});

describe('toPgVectorLiteral', () => {
  it('serializa no formato aceito pelo cast ::vector', () => {
    expect(toPgVectorLiteral([1, 2, 3])).toBe('[1,2,3]');
  });
});
