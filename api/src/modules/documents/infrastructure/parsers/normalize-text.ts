/**
 * Normalização de texto compartilhada pelos parsers.
 *
 * Estratégia (comum a MD/TXT/PDF):
 * - unifica quebras de linha `\r\n` e `\r` em `\n`;
 * - remove espaços/tabs no fim de cada linha;
 * - colapsa 3+ linhas em branco consecutivas em no máximo uma linha em branco
 *   (preserva parágrafos, elimina ruído);
 * - colapsa sequências de espaços/tabs em um único espaço dentro da linha;
 * - `trim()` nas bordas do texto inteiro.
 *
 * O objetivo é produzir texto limpo e estável para embedding, sem tentar preservar
 * formatação de apresentação.
 */
export function normalizeText(raw: string): string {
  const unifiedNewlines = raw.replace(/\r\n?/g, '\n');

  const lines = unifiedNewlines.split('\n').map((line) =>
    // colapsa espaços/tabs internos e remove trailing whitespace da linha.
    line.replace(/[^\S\n]+/g, ' ').replace(/ +$/g, ''),
  );

  const collapsed = lines
    .join('\n')
    // 3+ quebras de linha viram exatamente 2 (uma linha em branco = separador de parágrafo).
    .replace(/\n{3,}/g, '\n\n');

  return collapsed.trim();
}
