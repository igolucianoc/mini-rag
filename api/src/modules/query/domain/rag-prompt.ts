/**
 * Mensagem padrão quando não há evidência suficiente para responder.
 * Centralizada para reuso entre a resposta e os testes.
 */
export const NO_EVIDENCE_MESSAGE =
  'Não encontrei evidências suficientes nos seus documentos para responder a essa pergunta.';

/**
 * Monta o prompt de geração, instruindo o modelo a:
 *  - responder SOMENTE com base no contexto fornecido;
 *  - citar as fontes pelo número ([1], [2], ...);
 *  - responder EXCLUSIVAMENTE em JSON no formato esperado (validado por Zod na
 *    saída), o que dá suporte ao parsing estruturado e às citações reais.
 */
export function buildRagPrompt(question: string, contextText: string): string {
  return [
    'Você é um assistente que responde perguntas SOMENTE com base no CONTEXTO fornecido.',
    'Regras:',
    '- Use apenas as informações do CONTEXTO. Não use conhecimento externo.',
    '- Cite as fontes pelo número entre colchetes, como [1], [2].',
    '- Se o contexto não permitir responder, retorne "answer" explicando a ausência e "citations" vazio.',
    '- Responda EXCLUSIVAMENTE em JSON válido, sem texto fora do JSON, no formato:',
    '  {"answer": string, "citations": [{"sourceIndex": number, "snippet"?: string}]}',
    '',
    'CONTEXTO:',
    contextText,
    '',
    `PERGUNTA: ${question}`,
    '',
    'JSON:',
  ].join('\n');
}
