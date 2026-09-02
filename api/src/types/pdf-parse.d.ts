/**
 * Declaração de tipos mínima e tipada para `pdf-parse`.
 *
 * O pacote `pdf-parse` não publica tipos próprios. Em vez de puxar a dependência
 * comunitária `@types/pdf-parse` (e o risco de tipos frouxos/`any`), declaramos
 * aqui somente o que consumimos, de forma estrita — cumprindo a regra de ZERO `any`.
 *
 * Importamos de `pdf-parse/lib/pdf-parse.js` (e não da raiz `pdf-parse`) porque o
 * `index.js` do pacote roda um bloco de debug que lê um PDF de teste do disco
 * quando `!module.parent`; a entrada em `lib/` é a função pura de parsing.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  /** Metadados do documento retornados pela lib (formato livre do PDF.js). */
  interface PdfParseResult {
    /** Número de páginas do PDF. */
    readonly numpages: number;
    /** Número de páginas efetivamente renderizadas. */
    readonly numrender: number;
    /** Dicionário `info` do PDF (autor, título etc.); pode ser nulo. */
    readonly info: Readonly<Record<string, unknown>> | null;
    /** Metadados estendidos; formato dependente do PDF, tratado como desconhecido. */
    readonly metadata: unknown;
    /** Texto extraído concatenado. */
    readonly text: string;
    /** Versão do PDF.js usada. */
    readonly version: string;
  }

  interface PdfParseOptions {
    /** Limite de páginas a processar (0 = todas). */
    readonly max?: number;
    readonly version?: string;
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;

  export = pdfParse;
}
