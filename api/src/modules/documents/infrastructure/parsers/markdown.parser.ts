import { Injectable } from '@nestjs/common';
import type {
  DocumentParser,
  ParsedDocument,
  ParseInput,
  SupportedMimeType,
} from '@/shared/rag/ports/document-parser.port';
import { markdownToText } from './markdown-to-text';
import { normalizeText } from './normalize-text';

/** mimetype tratado por este parser. */
const MARKDOWN_MIME: SupportedMimeType = 'text/markdown';

/**
 * Parser de Markdown: decodifica o buffer como UTF-8, remove a marcação pesada
 * (via `markdownToText`) e normaliza o texto para embedding.
 */
@Injectable()
export class MarkdownParser implements DocumentParser {
  supports(mimeType: string): mimeType is SupportedMimeType {
    return mimeType === MARKDOWN_MIME;
  }

  parse(input: ParseInput): Promise<ParsedDocument> {
    const rawText = input.content.toString('utf-8');
    const text = normalizeText(markdownToText(rawText));
    return Promise.resolve({
      text,
      metadata: {
        format: 'markdown',
        originalFilename: input.originalFilename,
      },
    });
  }
}
