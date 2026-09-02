/**
 * Utilitários compartilhados dos adapters Hugging Face.
 *
 * O provider de LLM/embedding é EXCLUSIVAMENTE a Hugging Face (Inference API).
 * Estes adapters vivem em `infrastructure` e o domínio só conhece as portas
 * (`EmbeddingProvider`, `LLMProvider`) — nenhum SDK é importado, usamos apenas
 * `fetch` nativo (Node 22). O `HF_TOKEN` é secret: nunca é logado nem incluído
 * em mensagens de erro.
 */

/** Assinatura de fetch injetável (default: global). Permite mock em teste. */
export type FetchFn = typeof fetch;

/**
 * Base do roteador de Inference Providers da Hugging Face.
 *
 * A antiga `api-inference.huggingface.co` foi descontinuada (responde 410 e
 * redireciona para cá). O router unifica o acesso aos providers serverless com
 * um único HF_TOKEN. Duas superfícies são usadas por este projeto:
 *  - `/hf-inference/models/<model>/pipeline/<task>` para tarefas clássicas
 *    (ex.: feature-extraction/embeddings), servidas pelo provider hf-inference;
 *  - `/v1/chat/completions` (OpenAI-compatible) para chat/text-generation.
 */
export const HF_ROUTER_BASE_URL = 'https://router.huggingface.co';

/**
 * Monta a URL de uma tarefa de pipeline clássica no provider hf-inference.
 * Ex.: feature-extraction -> `/hf-inference/models/<model>/pipeline/feature-extraction`.
 */
export function hfInferencePipelineUrl(model: string, task: string): string {
  return `${HF_ROUTER_BASE_URL}/hf-inference/models/${model}/pipeline/${task}`;
}

/** URL do endpoint chat-completions (OpenAI-compatible) do router. */
export const HF_CHAT_COMPLETIONS_URL = `${HF_ROUTER_BASE_URL}/v1/chat/completions`;

/**
 * Erro de integração com a HF. NÃO carrega o token; apenas status e um trecho
 * seguro do corpo da resposta (para diagnóstico), com o token removido por
 * precaução caso a HF ecoe o header em algum corpo de erro.
 */
export class HuggingFaceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HuggingFaceError';
  }
}

/**
 * Faz um POST JSON autenticado na Inference API e devolve o corpo como `unknown`
 * (a validação de forma é responsabilidade de cada adapter, via type guard/Zod).
 *
 * Segurança: o token entra APENAS no header Authorization; jamais é logado nem
 * anexado a mensagens de erro. Erros de rede e status != 2xx viram
 * `HuggingFaceError` com mensagem sanitizada.
 */
export async function hfPostJson(
  fetchFn: FetchFn,
  url: string,
  token: string,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Falha de rede: NÃO propaga detalhes que possam conter o token.
    throw new HuggingFaceError('Falha de rede ao contatar a Hugging Face');
  }

  if (!response.ok) {
    const detail = sanitize(await safeReadText(response), token);
    throw new HuggingFaceError(
      `Hugging Face respondeu com status ${response.status}${detail ? `: ${detail}` : ''}`,
      response.status,
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new HuggingFaceError('Resposta da Hugging Face não é JSON válido');
  }
}

/** Lê o corpo como texto sem lançar (para compor mensagens de erro). */
async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Remove qualquer ocorrência do token do texto e limita o tamanho, garantindo
 * que o secret nunca vaze em logs/mensagens mesmo que a HF o ecoe.
 */
function sanitize(text: string, token: string): string {
  const withoutToken = token ? text.split(token).join('[REDACTED]') : text;
  const trimmed = withoutToken.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}
