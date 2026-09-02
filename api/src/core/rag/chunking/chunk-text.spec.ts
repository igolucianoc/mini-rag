import { describe, expect, it } from 'vitest';
import { chunkText, estimateTokenCount } from './chunk-text';

describe('chunkText', () => {
  it('retorna vazio para texto vazio ou só espaços', () => {
    expect(chunkText('', { chunkSize: 10, overlap: 2 })).toEqual([]);
    expect(chunkText('   \n\t ', { chunkSize: 10, overlap: 2 })).toEqual([]);
  });

  it('retorna um único chunk quando o texto é menor que chunkSize', () => {
    const chunks = chunkText('abcdef', { chunkSize: 10, overlap: 2 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      content: 'abcdef',
      startOffset: 0,
      endOffset: 6,
    });
  });

  it('divide texto múltiplo exato de chunkSize sem overlap em chunks contíguos', () => {
    // 12 chars, chunkSize 4, overlap 0 => 3 chunks exatos.
    const text = 'abcdefghijkl';
    const chunks = chunkText(text, { chunkSize: 4, overlap: 0 });
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.content)).toEqual(['abcd', 'efgh', 'ijkl']);
    expect(chunks.map((c) => [c.startOffset, c.endOffset])).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
    ]);
  });

  it('aplica overlap entre chunks consecutivos', () => {
    // chunkSize 5, overlap 2 => passo 3.
    const text = 'abcdefghij'; // 10 chars
    const chunks = chunkText(text, { chunkSize: 5, overlap: 2 });
    expect(chunks.map((c) => c.content)).toEqual(['abcde', 'defgh', 'ghij']);
    // fronteiras compartilham 2 chars: 'de' e 'gh'.
    expect(chunks[0]?.content.slice(-2)).toBe(chunks[1]?.content.slice(0, 2));
  });

  it('offsets são coerentes com o texto original', () => {
    const text = 'the quick brown fox jumps';
    const chunks = chunkText(text, { chunkSize: 8, overlap: 3 });
    for (const chunk of chunks) {
      expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
    }
  });

  it('rejeita parâmetros inválidos', () => {
    expect(() => chunkText('abc', { chunkSize: 0, overlap: 0 })).toThrow();
    expect(() => chunkText('abc', { chunkSize: 5, overlap: -1 })).toThrow();
    expect(() => chunkText('abc', { chunkSize: 5, overlap: 5 })).toThrow();
  });
});

describe('estimateTokenCount', () => {
  it('estima ~4 chars por token', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('abcd')).toBe(1);
    expect(estimateTokenCount('abcde')).toBe(2);
  });
});
