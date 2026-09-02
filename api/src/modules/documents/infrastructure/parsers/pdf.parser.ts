import { Injectable, Optional } from '@nestjs/common';
import type {
  DocumentParser,
  ParsedDocument,
  ParseInput,
  SupportedMimeType,
} from '@/shared/rag/ports/document-parser.port';
import { normalizeText } from './normalize-text';
import {
  defaultPdfTextExtractor,
  type PdfTextExtractor,
} from './pdf-text-extractor';

/** mimetype tratado por este parser. */
const PDF_MIME: SupportedMimeType = 'application/pdf';

/**
 * Parser de PDF: delega a extração de texto ao `PdfTextExtractor` (por padrão
 * `pdf-parse`) e normaliza o resultado. O extrator é injetável para testes.
 * Expõe `pageCount` nos metadados.
 */
@Injectable()
export class PdfParser implements DocumentParser {
  /**
   * Extrator de texto do PDF. Não é uma dependência do DI (o tipo é uma função,
   * que o Nest não sabe resolver); usa o `pdf-parse` por padrão e pode ser
   * sobrescrito nos testes via o parâmetro opcional do construtor.
   */
  private readonly extractText: PdfTextExtractor;

  constructor(@Optional() extractText?: PdfTextExtractor) {
    this.extractText = extractText ?? defaultPdfTextExtractor;
  }

  supports(mimeType: string): mimeType is SupportedMimeType {
    return mimeType === PDF_MIME;
  }

  async parse(input: ParseInput): Promise<ParsedDocument> {
    const extraction = await this.extractText(input.content);
    const text = normalizeText(extraction.text);
    return {
      text,
      metadata: {
        format: 'pdf',
        originalFilename: input.originalFilename,
        pageCount: extraction.pageCount,
      },
    };
  }
}
