/**
 * Normalização de texto compartilhada pelos parsers.
 *
 * Estratégia (comum a MD/TXT/PDF):
 * - remove o byte NUL (U+0000) e demais caracteres de controle não imprimíveis
 *   (C0/C1), preservando apenas `\n` e `\t`. O Postgres rejeita NUL em colunas
 *   `text` (erro 22021, "invalid byte sequence for encoding UTF8: 0x00"), e o
 *   `pdf-parse` pode emiti-lo ao extrair PDFs; limpar aqui protege a ingestão de
 *   qualquer fonte;
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
  // Remove NUL e caracteres de controle C0/C1 não imprimíveis, preservando
  // tab (\u0009) e newline (\u000A). Feito antes de tudo para que nenhum byte
  // inválido sobreviva até o INSERT no Postgres.
  // Preserva \t (U+0009), \n (U+000A) e \r (U+000D); a unificação de quebras de
  // linha logo abaixo cuida do \r.
  // eslint-disable-next-line no-control-regex
  const withoutControlChars = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  const unifiedNewlines = withoutControlChars.replace(/\r\n?/g, '\n');

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
