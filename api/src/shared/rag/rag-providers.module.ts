import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import { EMBEDDING_PROVIDER } from '@/shared/rag/ports/embedding-provider.port';
import type { EmbeddingProvider } from '@/shared/rag/ports/embedding-provider.port';
import { LLM_PROVIDER } from '@/shared/rag/ports/llm-provider.port';
import type { LLMProvider } from '@/shared/rag/ports/llm-provider.port';
import { VECTOR_STORE } from '@/shared/rag/ports/vector-store.port';
import { FakeEmbeddingProvider } from '@/modules/documents/infrastructure/embedding/fake-embedding.provider';
import { PgVectorStore } from '@/modules/documents/infrastructure/vector-store/pg-vector.store';
import { HuggingFaceEmbeddingProvider } from '@/shared/rag/infrastructure/huggingface/huggingface-embedding.provider';
import { HuggingFaceLLMProvider } from '@/shared/rag/infrastructure/huggingface/huggingface-llm.provider';
import { FakeLLMProvider } from '@/shared/rag/infrastructure/fake/fake-llm.provider';

/**
 * Um único ponto de binding dos providers de RAG, compartilhado entre slices.
 *
 * WIRING (decisão): ingestão (DocumentsModule) e retrieval (QueryModule) PRECISAM
 * usar o MESMO EmbeddingProvider e o MESMO VectorStore — indexar e buscar com
 * providers diferentes produziria espaços vetoriais incompatíveis. Por isso os
 * três tokens são bindados aqui, em um módulo `@Global()` que EXPORTA os tokens,
 * evitando duplicar a fábrica de seleção em cada slice.
 *
 * SELEÇÃO HF vs FAKE (por env, sem tocar em `process.env` fora do ConfigService):
 *  - HF_TOKEN presente e != 'test-token'  -> adapters reais da Hugging Face;
 *  - caso contrário (test/dev sem token)  -> Fakes determinísticos, permitindo
 *    rodar a suíte e a app localmente sem rede nem secret.
 * VECTOR_STORE é sempre PgVectorStore em runtime (pgvector); os testes usam
 * InMemoryVectorStore por instanciação direta, sem passar por este módulo.
 */
function hasRealHfToken(config: ConfigService<Env, true>): boolean {
  const token = config.get('HF_TOKEN', { infer: true });
  return token.length > 0 && token !== 'test-token';
}

@Global()
@Module({
  providers: [
    FakeEmbeddingProvider,
    PgVectorStore,
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): EmbeddingProvider =>
        hasRealHfToken(config)
          ? new HuggingFaceEmbeddingProvider(config)
          : new FakeEmbeddingProvider(),
      inject: [ConfigService],
    },
    {
      provide: LLM_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): LLMProvider =>
        hasRealHfToken(config)
          ? new HuggingFaceLLMProvider(config)
          : new FakeLLMProvider(),
      inject: [ConfigService],
    },
    { provide: VECTOR_STORE, useClass: PgVectorStore },
  ],
  exports: [EMBEDDING_PROVIDER, LLM_PROVIDER, VECTOR_STORE],
})
export class RagProvidersModule {}
