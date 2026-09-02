import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkdownParser } from './markdown.parser';
import { TxtParser } from './txt.parser';
import { PdfParser } from './pdf.parser';
import { normalizeText } from './normalize-text';
import {
  DOCUMENT_PARSERS,
  ParserRegistry,
  UnsupportedMimeTypeError,
} from './parser-registry';
import type { PdfTextExtractor } from './pdf-text-extractor';

const buf = (s: string): Buffer => Buffer.from(s, 'utf-8');

describe('normalizeText', () => {
  it('unifica CRLF e CR em LF', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('colapsa espaços internos e remove trailing whitespace', () => {
    expect(normalizeText('a    b   \nc\t\td')).toBe('a b\nc d');
  });

  it('colapsa 3+ linhas em branco em uma só', () => {
    expect(normalizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('faz trim das bordas e retorna vazio para só espaços', () => {
    expect(normalizeText('   \n\n  ')).toBe('');
    expect(normalizeText('  hello  ')).toBe('hello');
  });
});

describe('TxtParser', () => {
  let parser: TxtParser;
  beforeEach(() => {
    parser = new TxtParser();
  });

  it('suporta text/plain e não outros', () => {
    expect(parser.supports('text/plain')).toBe(true);
    expect(parser.supports('application/pdf')).toBe(false);
  });

  it('normaliza o texto e expõe metadata', async () => {
    const parsed = await parser.parse({
      content: buf('linha 1\r\n\r\n\r\n\r\nlinha 2   '),
      mimeType: 'text/plain',
      originalFilename: 'notes.txt',
    });
    expect(parsed.text).toBe('linha 1\n\nlinha 2');
    expect(parsed.metadata).toMatchObject({
      format: 'txt',
      originalFilename: 'notes.txt',
    });
  });
});

describe('MarkdownParser', () => {
  let parser: MarkdownParser;
  beforeEach(() => {
    parser = new MarkdownParser();
  });

  it('suporta text/markdown', () => {
    expect(parser.supports('text/markdown')).toBe(true);
    expect(parser.supports('text/plain')).toBe(false);
  });

  it('remove marcação e mantém o conteúdo legível', async () => {
    const md = [
      '# Título',
      '',
      'Um **texto** com _ênfase_ e um [link](http://x.com).',
      '',
      '- item 1',
      '- item 2',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');

    const parsed = await parser.parse({
      content: buf(md),
      mimeType: 'text/markdown',
      originalFilename: 'doc.md',
    });

    expect(parsed.text).toContain('Título');
    expect(parsed.text).toContain('Um texto com ênfase e um link.');
    expect(parsed.text).toContain('item 1');
    expect(parsed.text).toContain('const x = 1;');
    // marcação não deve sobrar
    expect(parsed.text).not.toContain('**');
    expect(parsed.text).not.toContain('```');
    expect(parsed.text).not.toContain('](http');
    expect(parsed.metadata).toMatchObject({ format: 'markdown' });
  });
});

describe('PdfParser', () => {
  it('usa o extrator injetado e expõe pageCount', async () => {
    const fakeExtractor: PdfTextExtractor = vi.fn().mockResolvedValue({
      text: 'texto\r\n\r\n\r\ndo   pdf',
      pageCount: 3,
    });
    const parser = new PdfParser(fakeExtractor);

    expect(parser.supports('application/pdf')).toBe(true);

    const parsed = await parser.parse({
      content: buf('%PDF-1.4 fake'),
      mimeType: 'application/pdf',
      originalFilename: 'file.pdf',
    });

    expect(parsed.text).toBe('texto\n\ndo pdf');
    expect(parsed.metadata).toMatchObject({ format: 'pdf', pageCount: 3 });
    expect(fakeExtractor).toHaveBeenCalledOnce();
  });
});

describe('ParserRegistry', () => {
  let registry: ParserRegistry;
  beforeEach(() => {
    const fakeExtractor: PdfTextExtractor = vi
      .fn()
      .mockResolvedValue({ text: 'x', pageCount: 1 });
    registry = new ParserRegistry([
      new MarkdownParser(),
      new TxtParser(),
      new PdfParser(fakeExtractor),
    ]);
  });

  it.each([
    ['text/markdown', MarkdownParser],
    ['text/plain', TxtParser],
    ['application/pdf', PdfParser],
  ])('resolve o parser correto para %s', (mime, ctor) => {
    expect(registry.supports(mime)).toBe(true);
    expect(registry.resolve(mime)).toBeInstanceOf(ctor);
  });

  it('rejeita mimetype não suportado com erro claro', () => {
    expect(registry.supports('image/png')).toBe(false);
    expect(() => registry.resolve('image/png')).toThrow(UnsupportedMimeTypeError);
    expect(() => registry.resolve('image/png')).toThrow(/não suportado: image\/png/);
  });
});

// A lista default de providers do registry existe (usada no módulo Nest).
describe('DOCUMENT_PARSERS token', () => {
  it('é um símbolo', () => {
    expect(typeof DOCUMENT_PARSERS).toBe('symbol');
  });
});
