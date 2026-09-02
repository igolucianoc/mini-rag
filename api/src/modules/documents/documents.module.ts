import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { RagProvidersModule } from '@/shared/rag/rag-providers.module';
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

/**
 * Slice de documentos (Etapa 05 — ingestão).
 *
 * EMBEDDING_PROVIDER e VECTOR_STORE agora vêm do RagProvidersModule (global),
 * compartilhado com o slice de query — assim ingestão e busca usam exatamente o
 * mesmo provider de embedding e o mesmo vector store. Aqui ficam apenas os
 * parsers, específicos deste slice.
 *
 * AuthModule é importado para reaproveitar JwtAccessGuard/TokenService que
 * protegem as rotas.
 */
@Module({
  imports: [AuthModule, RagProvidersModule],
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
  ],
})
export class DocumentsModule {}
