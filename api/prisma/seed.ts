/**
 * Seed do Mini RAG (Etapa 03) — determinístico e idempotente.
 *
 * REGRAS RESPEITADAS:
 * - NÃO chama LLM nem embedding externo. Os embeddings são FAKE e determinísticos
 *   (ver `fakeDeterministicEmbedding`), gerados localmente só para popular a coluna
 *   `vector(384)` e permitir demonstrar a busca por similaridade. NÃO são vetores
 *   semânticos reais — o embedding real (Hugging Face) entra nas Etapas 05/06.
 * - Idempotente: limpa as tabelas de domínio e recria os dados a cada execução.
 *
 * O embedding é escrito via `$executeRaw` com cast `::vector`, porque a coluna
 * `embedding` é `Unsupported` no Prisma e não é acessível pelo client tipado.
 *
 * HASH DE SENHA (Etapa 04): o usuário demo recebe um hash argon2id real, gerado
 * em runtime pela mesma lib usada no login. Credenciais demo:
 * demo@mini-rag.local / demo-password-123.
 */
import * as argon2 from 'argon2';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  fakeDeterministicEmbedding,
  toPgVectorLiteral,
} from '../src/shared/rag/embedding/deterministic-embedding';
import { chunkText } from '../src/shared/rag/chunking/chunk-text';

const prisma = new PrismaClient();

/**
 * Senha demo do usuário seed. O hash é gerado em runtime com argon2id — a MESMA
 * lib usada no login (Etapa 04) —, então o usuário demo consegue autenticar de
 * verdade. Credenciais demo: demo@mini-rag.local / demo-password-123.
 */
const DEMO_PASSWORD = 'demo-password-123';

const DEMO_USER_EMAIL = 'demo@mini-rag.local';

interface SeedDocument {
  readonly title: string;
  readonly originalFilename: string;
  readonly sourceType: 'MARKDOWN' | 'TXT' | 'PDF';
  readonly mimeType: string;
  readonly body: string;
}

const SEED_DOCUMENTS: readonly SeedDocument[] = [
  {
    title: 'Guia de RAG',
    originalFilename: 'guia-de-rag.md',
    sourceType: 'MARKDOWN',
    mimeType: 'text/markdown',
    body: [
      'RAG (Retrieval-Augmented Generation) combina recuperação de documentos com geração de texto.',
      'O fluxo básico é: indexar documentos em chunks, embedar cada chunk e buscar os mais relevantes para a pergunta.',
      'Os chunks recuperados são injetados no prompt do modelo como contexto, reduzindo alucinação.',
      'Quando nenhum chunk é suficientemente relevante, o sistema deve recusar responder em vez de inventar.',
      'Citações amarram cada afirmação da resposta ao chunk de origem, permitindo verificação pelo usuário.',
    ].join('\n'),
  },
  {
    title: 'Boas práticas de embeddings',
    originalFilename: 'boas-praticas-embeddings.md',
    sourceType: 'MARKDOWN',
    mimeType: 'text/markdown',
    body: [
      'Embeddings mapeiam texto para vetores densos onde proximidade indica similaridade semântica.',
      'Use o mesmo modelo de embedding para indexar documentos e para embedar a pergunta na busca.',
      'Normalize os vetores (L2) quando usar similaridade de cosseno para manter as pontuações comparáveis.',
      'O modelo all-MiniLM-L6-v2 produz vetores de 384 dimensões, um bom equilíbrio entre custo e qualidade.',
      'Chunks pequenos demais perdem contexto; grandes demais diluem a relevância na recuperação.',
    ].join('\n'),
  },
  {
    title: 'pgvector overview',
    originalFilename: 'pgvector-overview.txt',
    sourceType: 'TXT',
    mimeType: 'text/plain',
    body: [
      'pgvector é uma extensão do PostgreSQL que adiciona o tipo de dado vector para armazenar embeddings.',
      'Ela suporta busca por distância L2, produto interno e distância de cosseno via operadores dedicados.',
      'Índices HNSW e ivfflat aceleram a busca aproximada de vizinhos mais próximos em grandes volumes.',
      'Para similaridade de cosseno, use o operador de distância <=> com a classe de operador vector_cosine_ops.',
      'Como o embedding é uma coluna vetorial, a escrita e a leitura são feitas por SQL com cast ::vector.',
    ].join('\n'),
  },
  {
    title: 'Estratégias de chunking',
    originalFilename: 'estrategias-de-chunking.pdf',
    sourceType: 'PDF',
    mimeType: 'application/pdf',
    body: [
      'Chunking é a divisão de um documento em pedaços menores antes de embedar.',
      'A estratégia de janela deslizante usa um tamanho fixo com sobreposição entre chunks vizinhos.',
      'A sobreposição preserva contexto que ficaria cortado exatamente na fronteira entre dois chunks.',
      'Manter offsets de início e fim de cada chunk permite rastrear o trecho de origem para citações.',
      'A contagem aproximada de tokens ajuda a controlar o tamanho do contexto enviado ao modelo.',
    ].join('\n'),
  },
];

/** Parâmetros de chunking do seed (pequenos, para gerar vários chunks por doc). */
const SEED_CHUNK_OPTIONS = { chunkSize: 160, overlap: 40 } as const;

async function resetDomainData(): Promise<void> {
  // Ordem respeita as FKs (cascade cobriria, mas explicitar deixa o seed claro).
  await prisma.citation.deleteMany();
  await prisma.query.deleteMany();
  await prisma.ingestionRun.deleteMany();
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();
}

async function seedEmbeddingForChunk(
  chunkId: string,
  content: string,
): Promise<void> {
  // Embedding FAKE determinístico — só para demo de similaridade (ver topo do arquivo).
  const embedding = fakeDeterministicEmbedding(content);
  const literal = toPgVectorLiteral(embedding);
  // Coluna Unsupported => escrita via SQL bruto com cast ::vector.
  await prisma.$executeRaw`
    UPDATE "document_chunks"
    SET "embedding" = ${literal}::vector
    WHERE "id" = ${chunkId}
  `;
}

async function main(): Promise<void> {
  // GUARDA ANTI-PERDA: o seed é destrutivo (reseta as tabelas de domínio). Se o
  // banco já tiver dados, aborta SEM apagar nada — a menos que SEED_FORCE=true
  // seja passado explicitamente para repopular um banco de demo.
  const force = process.env.SEED_FORCE === 'true';
  const [userCount, documentCount] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
  ]);

  if (!force && (userCount > 0 || documentCount > 0)) {
    // eslint-disable-next-line no-console
    console.log(
      `seed pulado: banco já contém dados (${userCount} usuário(s), ${documentCount} documento(s)). ` +
        'Use SEED_FORCE=true para resetar e reinserir o seed determinístico.',
    );
    return;
  }

  await resetDomainData();

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: DEMO_USER_EMAIL,
      passwordHash,
    },
  });

  let totalChunks = 0;

  for (const doc of SEED_DOCUMENTS) {
    const sizeBytes = Buffer.byteLength(doc.body, 'utf8');
    const chunks = chunkText(doc.body, SEED_CHUNK_OPTIONS);

    const document = await prisma.document.create({
      data: {
        userId: user.id,
        title: doc.title,
        sourceType: doc.sourceType,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType,
        sizeBytes,
        status: 'READY',
      },
    });

    for (const chunk of chunks) {
      const created = await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          metadata: { source: doc.originalFilename } satisfies Prisma.JsonObject,
        },
      });
      await seedEmbeddingForChunk(created.id, created.content);
      totalChunks += 1;
    }

    await prisma.ingestionRun.create({
      data: {
        documentId: document.id,
        status: 'COMPLETED',
        finishedAt: new Date(),
        chunkCount: chunks.length,
        stats: {
          chunkSize: SEED_CHUNK_OPTIONS.chunkSize,
          overlap: SEED_CHUNK_OPTIONS.overlap,
          fakeEmbeddings: true,
        } satisfies Prisma.JsonObject,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `seed ok: 1 usuário demo, ${SEED_DOCUMENTS.length} documentos, ${totalChunks} chunks (embeddings fake determinísticos).`,
  );
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('seed falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
