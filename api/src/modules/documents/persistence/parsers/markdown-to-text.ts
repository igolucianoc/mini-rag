/**
 * Conversão "boa o suficiente" de Markdown para texto limpo para embedding.
 *
 * Não é um parser Markdown completo (nem precisa ser): removemos a marcação mais
 * pesada que só polui o texto para fins de embedding, preservando o conteúdo
 * legível. Estratégia, na ordem aplicada:
 *  1. remove blocos de código cercados (```), mantendo o código interno como texto;
 *  2. remove código inline (`code`) mantendo o conteúdo;
 *  3. imagens `![alt](url)` => usa o `alt`;
 *  4. links `[texto](url)` => mantém só o `texto`;
 *  5. remove marcadores de heading (`#`), citação (`>`) e itens de lista (`-`, `*`, `+`, `1.`);
 *  6. remove ênfase (`**`, `__`, `*`, `_`, `~~`);
 *  7. remove linhas horizontais (`---`, `***`).
 *
 * A normalização final de espaços/linhas fica a cargo de `normalizeText`.
 */
export function markdownToText(markdown: string): string {
  let text = markdown;

  // 1. blocos de código cercados: remove as cercas, mantém o conteúdo.
  text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_match, code: string) => code);

  // 2. código inline.
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => code);

  // 3. imagens: mantém o texto alternativo.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => alt);

  // 4. links: mantém o rótulo.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, (_match, label: string) => label);

  // 5. marcadores de início de linha (heading, citação, lista ordenada/não ordenada).
  text = text.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '');

  // 6. ênfase e strikethrough.
  text = text.replace(/(\*\*|__|~~|[*_])(.*?)\1/g, (_match, _marker, inner: string) => inner);

  // 7. linhas horizontais.
  text = text.replace(/^\s{0,3}(?:[-*_]\s?){3,}\s*$/gm, '');

  return text;
}
