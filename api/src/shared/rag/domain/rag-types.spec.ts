import { describe, expect, it } from 'vitest';
import {
  isAnsweredRag,
  isSufficientRetrieval,
  type RagAnswer,
  type RetrievalResult,
} from './rag-types';

describe('isSufficientRetrieval', () => {
  it('discrimina retrieval com evidência suficiente', () => {
    const result: RetrievalResult = { kind: 'sufficient', chunks: [] };
    expect(isSufficientRetrieval(result)).toBe(true);
    if (isSufficientRetrieval(result)) {
      // narrowing: acesso a chunks sem reason.
      expect(result.chunks).toEqual([]);
    }
  });

  it('discrimina retrieval insuficiente e expõe reason', () => {
    const result: RetrievalResult = {
      kind: 'insufficient',
      chunks: [],
      reason: 'nenhum chunk acima do limiar',
    };
    expect(isSufficientRetrieval(result)).toBe(false);
    if (!isSufficientRetrieval(result)) {
      expect(result.reason).toContain('limiar');
    }
  });
});

describe('isAnsweredRag', () => {
  it('discrimina resposta com citações', () => {
    const answer: RagAnswer = {
      kind: 'answered',
      text: 'resposta',
      citations: [
        { documentId: 'd1', chunkIndex: 0, snippet: 's', score: 0.9, rank: 1 },
      ],
    };
    expect(isAnsweredRag(answer)).toBe(true);
    if (isAnsweredRag(answer)) {
      expect(answer.citations).toHaveLength(1);
    }
  });

  it('discrimina resposta sem evidência', () => {
    const answer: RagAnswer = {
      kind: 'no_evidence',
      text: 'não há base suficiente',
    };
    expect(isAnsweredRag(answer)).toBe(false);
  });
});
