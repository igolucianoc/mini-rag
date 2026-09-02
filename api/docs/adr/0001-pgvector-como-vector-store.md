# ADR 0001 — pgvector como vector store

Status: Aceito

## Context

O pipeline RAG precisa persistir embeddings de chunks e recuperá-los por
similaridade. Já usamos PostgreSQL (via Prisma) como banco relacional para
usuários, documentos e chunks. Introduzir um vector store dedicado (Pinecone,
Qdrant, Weaviate) adicionaria mais um serviço para operar, sincronizar e
autenticar, sem ganho relevante na escala deste projeto.

## Decision

Usar a extensão **pgvector** no próprio PostgreSQL como vector store. A coluna de
embedding fica em `DocumentChunk.embedding` com tipo `vector(384)` (dimensão do
`all-MiniLM-L6-v2`).

Como o Prisma não tem tipo nativo `vector`, a coluna é declarada como
`Unsupported("vector(384)")?`. Isso significa que o client tipado não lê nem
grava a coluna: toda escrita e busca de embedding é feita por SQL bruto
(`$executeRaw` / `$queryRaw`). A migration inicial habilita a extensão
(`CREATE EXTENSION IF NOT EXISTS vector`) e cria o índice de similaridade.

## Consequences

- Um único datastore para operar; joins entre metadados relacionais e vetores
  ficam triviais (filtro por `userId`/`documentId` no mesmo SQL da busca).
- Perde-se a segurança de tipos do Prisma na coluna de embedding; o acesso via
  SQL bruto fica isolado no adapter `VectorStore` (Etapa 06) e coberto por revisão.
- A dimensão 384 fica acoplada ao modelo de embedding; trocar de modelo exige
  migration para alterar a coluna e reindexar.
