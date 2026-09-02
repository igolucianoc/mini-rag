import { Injectable } from '@nestjs/common';
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
  constructor(
    private readonly extractText: PdfTextExtractor = defaultPdfTextExtractor,
  ) {}

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
