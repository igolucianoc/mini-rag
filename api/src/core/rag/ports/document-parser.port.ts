/**
 * Porta: DocumentParser.
 *
 * Recebe o conteúdo bruto de um arquivo (MD/TXT/PDF) e devolve texto normalizado
 * + metadados. A implementação concreta (por mimetype) vem na Etapa 05, aqui só o
 * contrato e os tipos. O domínio não conhece nenhuma lib de parsing.
 */

/** Tipos de fonte suportados pelo pipeline. */
export type SupportedMimeType =
  | 'text/markdown'
  | 'text/plain'
  | 'application/pdf';

export interface ParseInput {
  /** Conteúdo bruto do arquivo. */
  readonly content: Buffer;
  readonly mimeType: SupportedMimeType;
  readonly originalFilename: string;
}

export interface ParsedDocument {
  /** Texto normalizado (sem markup específico do formato). */
  readonly text: string;
  /** Metadados extraídos (título, páginas, headings etc.). */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface DocumentParser {
  /** Indica se este parser lida com o mimetype informado. */
  supports(mimeType: string): mimeType is SupportedMimeType;
  parse(input: ParseInput): Promise<ParsedDocument>;
}

/** Símbolo de injeção Nest para a porta. */
export const DOCUMENT_PARSER = Symbol('DocumentParser');
