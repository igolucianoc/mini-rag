/**
 * Porta: LLMProvider.
 *
 * O provider de LLM é exclusivamente a Hugging Face (ver prompts/huggingface-access-token.md).
 * O domínio não importa o SDK; o adapter concreto vive em `infrastructure`.
 *
 * `generate` retorna a resposta completa. `generateStream` está no contrato desde já
 * (será usado na Etapa 07) devolvendo um AsyncIterable de fragmentos de texto; nenhum
 * provider real é implementado agora.
 */
export interface LLMProvider {
  generate(prompt: string): Promise<string>;
  /** Variante de streaming: emite fragmentos de texto conforme são gerados. */
  generateStream(prompt: string): AsyncIterable<string>;
}

export const LLM_PROVIDER = Symbol('LLMProvider');
