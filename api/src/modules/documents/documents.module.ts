import { Module } from '@nestjs/common';
import { EMBEDDING_PROVIDER } from '@/shared/rag/ports/embedding-provider.port';
import { VECTOR_STORE } from '@/shared/rag/ports/vector-store.port';
import { AuthModule } from '@/modules/auth/auth.module';
import { DocumentsController } from './presentation/documents.controller';
import { IngestionService } from './application/ingestion.service';
import { DocumentsService } from './application/documents.service';
import {
  DOCUMENT_PARSERS,
  ParserRegistry,
} from './infrastructure/parsers/parser-registry';
import { MarkdownParser } from './infrastructure/parsers/markdown.parser';
import { TxtParser } from './infrastructure/parsers/txt.parser';
import { PdfParser } from './infrastructure/parsers/pdf.parser';
import { FakeEmbeddingProvider } from './infrastructure/embedding/fake-embedding.provider';
import { PgVectorStore } from './infrastructure/vector-store/pg-vector.store';

/**
 * Slice de documentos (Etapa 05 — ingestão).
 *
 * Injeção por token:
 *  - EMBEDDING_PROVIDER -> FakeEmbeddingProvider (a Etapa 06 pluga o HF real);
 *  - VECTOR_STORE -> PgVectorStore (pgvector via SQL bruto);
 *  - DOCUMENT_PARSERS -> [Markdown, Txt, Pdf], consumidos pelo ParserRegistry.
 *
 * AuthModule é importado para reaproveitar JwtAccessGuard/TokenService que
 * protegem as rotas.
 */
@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [
    IngestionService,
    DocumentsService,
    MarkdownParser,
    TxtParser,
    PdfParser,
    ParserRegistry,
    {
      provide: DOCUMENT_PARSERS,
      useFactory: (
        markdown: MarkdownParser,
        txt: TxtParser,
        pdf: PdfParser,
      ) => [markdown, txt, pdf],
      inject: [MarkdownParser, TxtParser, PdfParser],
    },
    { provide: EMBEDDING_PROVIDER, useClass: FakeEmbeddingProvider },
    { provide: VECTOR_STORE, useClass: PgVectorStore },
  ],
})
export class DocumentsModule {}
