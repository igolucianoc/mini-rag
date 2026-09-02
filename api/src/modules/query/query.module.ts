import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { RagProvidersModule } from '@/infra/rag/rag-providers.module';
import { QueryController } from './presentation/query.controller';
import { RetrievalService } from './application/retrieval.service';
import { RagAnswerService } from './application/rag-answer.service';
import { RagService } from './application/rag.service';
import { RagStreamService } from './application/rag-stream.service';
import { QueryHistoryService } from './application/query-history.service';

/**
 * Slice de query (Etapa 06 — retrieval + geração).
 *
 * Decisão de slices: um único slice coeso `query` orquestra recuperação e
 * geração, em vez de dois slices `retrieval` + `chat`. No fluxo síncrono os dois
 * passos andam sempre juntos; separá-los criaria fronteiras de módulo e
 * rebinding de providers sem ganho real (overengineering). A camada `application`
 * já isola as responsabilidades: `RetrievalService` (busca), `context-builder`
 * (contexto puro), `RagAnswerService` (citações reais + persistência,
 * compartilhado), `RagService` (orquestra o fluxo síncrono) e `RagStreamService`
 * (orquestra o fluxo SSE da Etapa 07 — sem WebSocket).
 *
 * EMBEDDING_PROVIDER, VECTOR_STORE e LLM_PROVIDER vêm do RagProvidersModule
 * (global, compartilhado com DocumentsModule) — mesma instância de embedding e
 * vector store usada na ingestão, garantindo o mesmo espaço vetorial.
 */
@Module({
  imports: [AuthModule, RagProvidersModule],
  controllers: [QueryController],
  providers: [
    RetrievalService,
    RagAnswerService,
    RagService,
    RagStreamService,
    QueryHistoryService,
  ],
})
export class QueryModule {}
