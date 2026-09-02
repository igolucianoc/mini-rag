import { Injectable } from '@nestjs/common';
import type {
  DocumentParser,
  ParsedDocument,
  ParseInput,
  SupportedMimeType,
} from '@/core/rag/ports/document-parser.port';
import { normalizeText } from './normalize-text';

/** mimetype tratado por este parser. */
const TXT_MIME: SupportedMimeType = 'text/plain';

/**
 * Parser de texto puro: decodifica o buffer como UTF-8 e normaliza. Nenhuma lib
 * externa é necessária.
 */
@Injectable()
export class TxtParser implements DocumentParser {
  supports(mimeType: string): mimeType is SupportedMimeType {
    return mimeType === TXT_MIME;
  }

  parse(input: ParseInput): Promise<ParsedDocument> {
    const text = normalizeText(input.content.toString('utf-8'));
    return Promise.resolve({
      text,
      metadata: {
        format: 'txt',
        originalFilename: input.originalFilename,
      },
    });
  }
}
