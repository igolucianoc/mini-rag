import { Injectable } from '@nestjs/common';
import type { LLMProvider } from '@/shared/rag/ports/llm-provider.port';

/** Tamanho dos fragmentos emitidos por `generateStream` (fake). */
const STREAM_CHUNK_SIZE = 16;

/**
 * LLMProvider FAKE e determinístico — usado em testes e quando não há HF_TOKEN
 * válido (permite rodar a app sem a Hugging Face).
 *
 * A `rag.service` instrui o modelo a responder em JSON estruturado
 * (`{ answer, citations }`). Para ser útil sem rede, o fake:
 *  - detecta os marcadores de fonte `[n]` presentes no prompt (o contexto é
 *    numerado por [1], [2], ...);
 *  - devolve um JSON válido citando a primeira fonte disponível (ou nenhuma, se
 *    o prompt não trouxer contexto numerado).
 * Assim o caminho "answered" fica determinístico e as citações apontam para uma
 * fonte que de fato existe no contexto.
 */
@Injectable()
export class FakeLLMProvider implements LLMProvider {
  generate(prompt: string): Promise<string> {
    const sourceIndexes = extractSourceIndexes(prompt);
    const answer =
      sourceIndexes.length > 0
        ? `Resposta determinística de teste baseada na fonte [${sourceIndexes[0]}].`
        : 'Resposta determinística de teste sem fontes.';

    const citations = sourceIndexes.slice(0, 1).map((sourceIndex) => ({
      sourceIndex,
    }));

    return Promise.resolve(JSON.stringify({ answer, citations }));
  }

  async *generateStream(prompt: string): AsyncIterable<string> {
    const full = await this.generate(prompt);
    for (let i = 0; i < full.length; i += STREAM_CHUNK_SIZE) {
      yield full.slice(i, i + STREAM_CHUNK_SIZE);
    }
  }
}

/**
 * Extrai os índices de fonte (`[n]`) citados no texto, em ordem de aparição e
 * sem duplicatas. Base para o fake citar apenas fontes existentes.
 */
function extractSourceIndexes(text: string): number[] {
  const found = new Set<number>();
  const regex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    const value = Number.parseInt(match[1] ?? '', 10);
    if (Number.isInteger(value)) {
      found.add(value);
    }
    match = regex.exec(text);
  }
  return [...found];
}
