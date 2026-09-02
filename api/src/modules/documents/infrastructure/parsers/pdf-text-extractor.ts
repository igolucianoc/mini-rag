import pdfParse from 'pdf-parse/lib/pdf-parse.js';

/** Resultado mínimo da extração de texto de um PDF. */
export interface PdfExtraction {
  readonly text: string;
  readonly pageCount: number;
}

/**
 * Contrato da função de extração de texto de PDF. Isolar a chamada ao `pdf-parse`
 * atrás desta interface permite injetar um fake nos testes sem depender da lib
 * real (que carrega o PDF.js e leria arquivos do disco).
 */
export type PdfTextExtractor = (content: Buffer) => Promise<PdfExtraction>;

/**
 * Extrator padrão baseado em `pdf-parse`. `pdf-parse` é a forma padrão e mais
 * difundida de extrair texto de PDF em Node (wrapper sobre o PDF.js da Mozilla),
 * sem exigir binários nativos — daí a escolha da dependência.
 */
export const defaultPdfTextExtractor: PdfTextExtractor = async (content) => {
  const result = await pdfParse(content);
  return { text: result.text, pageCount: result.numpages };
};
