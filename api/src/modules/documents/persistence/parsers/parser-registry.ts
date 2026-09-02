import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentParser,
  SupportedMimeType,
} from '@/core/rag/ports/document-parser.port';
import { MarkdownParser } from './markdown.parser';
import { TxtParser } from './txt.parser';
import { PdfParser } from './pdf.parser';

/** Erro lançado quando nenhum parser registrado suporta o mimetype. */
export class UnsupportedMimeTypeError extends Error {
  constructor(readonly mimeType: string) {
    super(`Tipo de arquivo não suportado: ${mimeType}`);
    this.name = 'UnsupportedMimeTypeError';
  }
}

/** Token de injeção para a lista de parsers (permite testar/estender). */
export const DOCUMENT_PARSERS = Symbol('DocumentParsers');

/**
 * Registry/factory de parsers. Recebe a lista de parsers concretos e resolve o
 * apropriado pelo mimetype via `supports`. Rejeita mimetypes não suportados com
 * `UnsupportedMimeTypeError` (mensagem clara).
 */
@Injectable()
export class ParserRegistry {
  private readonly parsers: readonly DocumentParser[];

  constructor(
    @Inject(DOCUMENT_PARSERS) parsers: readonly DocumentParser[],
  ) {
    this.parsers = parsers;
  }

  /** True se algum parser registrado suporta o mimetype. */
  supports(mimeType: string): mimeType is SupportedMimeType {
    return this.parsers.some((parser) => parser.supports(mimeType));
  }

  /** Retorna o parser para o mimetype ou lança `UnsupportedMimeTypeError`. */
  resolve(mimeType: string): DocumentParser {
    const parser = this.parsers.find((candidate) => candidate.supports(mimeType));
    if (!parser) {
      throw new UnsupportedMimeTypeError(mimeType);
    }
    return parser;
  }

  /** Providers padrão do registry para o módulo Nest. */
  static readonly defaultParserProviders = [
    MarkdownParser,
    TxtParser,
    PdfParser,
  ] as const;
}
