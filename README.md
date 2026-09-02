# Mini RAG Knowledge Base

Uma base de conhecimento com **RAG (Retrieval-Augmented Generation)**: você envia seus
documentos (Markdown, TXT ou PDF), o sistema os indexa em embeddings e responde
perguntas em linguagem natural **citando os trechos exatos** que embasaram cada
resposta — e recusando responder quando não há evidência suficiente, em vez de
alucinar.

Projeto full-stack de portfólio, com foco em RAG, embeddings, retrieval, citações
verificáveis e boas práticas de engenharia (TypeScript strict, testes, Docker).

---

## O problema

LLMs respondem com confiança mesmo quando não sabem. Para uma base de conhecimento
isso é inaceitável: o usuário precisa saber **de onde** veio cada afirmação e
confiar que o sistema não inventa. Este projeto resolve isso com um pipeline RAG
que:

- recupera apenas trechos dos **seus** documentos (isolados por usuário);
- injeta esses trechos como contexto no modelo;
- amarra cada resposta a **citações reais** (documento + trecho + score);
- responde *"não encontrei evidências suficientes"* quando nenhum trecho é
  relevante o bastante.

---

## Arquitetura

Monorepo com dois workspaces (`api` e `web`) orquestrados por Docker Compose.

```
┌──────────────┐      HTTP/JSON + SSE       ┌──────────────────┐
│   web (Vue)  │ ───────────────────────▶   │   api (NestJS)   │
│  Vite :5173  │ ◀───────────────────────   │      :3000       │
└──────────────┘                            └────────┬─────────┘
                                                      │ Prisma
                                                      ▼
                                            ┌──────────────────┐
                                            │ PostgreSQL +     │
                                            │ pgvector  :5432  │
                                            └──────────────────┘
                                                      ▲
                                            embeddings/LLM via
                                            Hugging Face (router
                                            de Inference Providers)
```

- **Backend (`api/`)** — NestJS + TypeScript, Prisma ORM, arquitetura em camadas
  (presentation → application → infrastructure) com portas e adapters para os
  provedores de embedding, LLM e vector store.
- **Frontend (`web/`)** — Vue 3 (`<script setup>`) + Pinia + Vue Router + Vite.
  Design tokens seguem o `DESIGN.md`.
- **Dados** — PostgreSQL com a extensão **pgvector** para busca por similaridade.
- **IA** — Hugging Face como provedor exclusivo de embeddings e geração, via o
  router de Inference Providers. Sem token, a app cai em provedores *fake*
  determinísticos (roda offline, sem segredo).

### Stack

| Camada | Tecnologias |
|--------|-------------|
| Backend | NestJS 10, TypeScript (strict), Prisma 6, Zod, `@nestjs/throttler`, JWT |
| Frontend | Vue 3, Pinia, Vue Router, Vite 6 |
| Dados | PostgreSQL 16 + pgvector, embeddings `vector(384)` |
| IA | Hugging Face Inference Providers (`all-MiniLM-L6-v2` p/ embeddings; chat model p/ geração) |
| Infra | Docker, Docker Compose, multi-stage build, healthchecks |
| Testes | Vitest (backend e frontend) |

---

## Pipeline RAG

### Ingestão (upload de documento)

1. **Upload** multipart (`POST /api/documents`, limite de 20 MB), validado por
   mimetype e tamanho.
2. **Parsing** por tipo (Markdown / TXT / PDF) e **normalização** do texto
   (remove caracteres de controle, unifica quebras de linha, colapsa espaços).
3. **Chunking** por janela deslizante de caracteres — `chunkSize` 1000, `overlap`
   200 (20%) por padrão — preservando offsets para rastrear a origem de cada trecho.
4. **Embeddings** de cada chunk (384 dimensões).
5. **Persistência** dos chunks + vetores no pgvector; o documento fica `READY`
   (ou `FAILED`, com o erro registrado).

### Consulta (pergunta)

1. A pergunta é **embedada com o mesmo modelo** usado na indexação.
2. **Retrieval** por similaridade de cosseno no pgvector, escopado ao usuário,
   `topK` = 5 (configurável).
3. Só passam chunks acima do **limiar de similaridade** (0.3 por padrão). Se
   nenhum passa, a resposta é `no_evidence`.
4. Os trechos viram contexto do prompt; o LLM gera a resposta.
5. Cada afirmação é amarrada a **citações reais** (documento, trecho, score,
   rank) — índices inventados pelo modelo são descartados.
6. A resposta pode ser consumida de forma síncrona (`POST /api/queries`) ou em
   **streaming via SSE** (`GET /api/queries/stream`).

---

## Decisões de arquitetura (ADRs)

Decisões registradas em [`api/docs/adr/`](api/docs/adr/):

- **[ADR 0001](api/docs/adr/0001-pgvector-como-vector-store.md)** — pgvector como
  vector store (um único datastore; join direto entre metadados e vetores).
- **[ADR 0002](api/docs/adr/0002-estrategia-de-chunking.md)** — chunking por janela
  deslizante de caracteres com overlap configurável.
- **[ADR 0003](api/docs/adr/0003-similaridade-cosine-e-topk.md)** — similaridade por
  cosseno (`<=>`) e `topK` default 5.
- **[ADR 0004](api/docs/adr/0004-estrategia-de-citacoes.md)** — citações amarradas
  ao trecho de origem e sinalização tipada de "sem evidência".

Outras decisões relevantes:

- **Autenticação** — access token JWT de vida curta + refresh token rotativo em
  cookie `httpOnly`; rate limiting estrito em login/refresh.
- **Segurança do vetor** — a coluna de embedding é `Unsupported` no Prisma; todo
  acesso é por SQL parametrizado (`Prisma.sql`), isolado no adapter.
- **Providers plugáveis** — embedding/LLM/vector store atrás de portas; HF real ou
  fakes determinísticos selecionados por ambiente.

---

## Setup

### Pré-requisitos

- Docker e Docker Compose, **ou** Node.js 22+ e um PostgreSQL 16 com pgvector.
- (Opcional) um token da Hugging Face para embeddings/geração reais. Sem ele, a
  app usa provedores fake determinísticos.

### Rodando com Docker (recomendado)

```bash
cp .env.example .env      # ajuste os valores (veja abaixo)
docker compose up --build
```

Serviços expostos:

- Frontend: <http://localhost:5173>
- API: <http://localhost:3000/api> (health em `/api/health`)
- PostgreSQL: `localhost:5432`

As migrations são aplicadas automaticamente na subida (`prisma migrate deploy`).

### Variáveis de ambiente

Definidas em `.env` (veja `.env.example`). As principais:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Conexão PostgreSQL. Deve bater com `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do container do banco. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Segredos JWT (troque por valores fortes). |
| `HF_TOKEN` | Token da Hugging Face. Use `test-token` para forçar os providers fake. |
| `HF_MODEL` | Modelo de chat/geração (ex.: `meta-llama/Llama-3.1-8B-Instruct`). |
| `HF_EMBEDDING_MODEL` | Modelo de embedding (`sentence-transformers/all-MiniLM-L6-v2`, 384 dims). |
| `WEB_ORIGIN` | Origem do frontend, usada no CORS. |
| `RUN_SEED` | `true` popula o banco de demo na subida (padrão `false`). |

> O `.env` real nunca é versionado (está no `.gitignore`); apenas o `.env.example`
> com placeholders é publicado.

### Rodando localmente sem Docker

```bash
npm install                     # instala os workspaces (api + web)

# Backend
npm run prisma:migrate:dev -w api
npm run start:dev -w api        # API em :3000

# Frontend (outro terminal)
npm run dev -w web              # Vite em :5173
```

---

## Seed (dados de demonstração)

O seed é **determinístico e não destrutivo por padrão**: ele só popula o banco se
estiver vazio (ou com `SEED_FORCE=true`), evitando apagar dados reais por engano.
Cria um usuário demo e alguns documentos com embeddings fake determinísticos.

```bash
# Via Docker (popula na subida)
RUN_SEED=true docker compose up --build

# Localmente
npm run seed -w api

# Forçar reset + repopular (APAGA os dados de domínio)
SEED_FORCE=true npm run seed -w api
```

Credenciais do usuário demo:

```
email:    demo@mini-rag.local
password: demo-password-123
```

---

## Exemplos de uso (API)

```bash
# 1. Login (recebe o access token no corpo; o refresh vai em cookie httpOnly)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@mini-rag.local","password":"demo-password-123"}'

# 2. Enviar um documento (campo do arquivo: "file")
curl -s -X POST http://localhost:3000/api/documents \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./meu-documento.md;type=text/markdown"

# 3. Fazer uma pergunta (resposta com citações)
curl -s -X POST http://localhost:3000/api/queries \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"O que são embeddings?"}'
```

Resposta (resumida):

```json
{
  "answer": {
    "kind": "answered",
    "text": "Embeddings mapeiam texto para vetores densos de 384 dimensões.",
    "citations": [
      { "documentId": "…", "chunkIndex": 0, "snippet": "…", "score": 0.75, "rank": 1 }
    ]
  },
  "hadSufficientEvidence": true,
  "modelId": "meta-llama/Llama-3.1-8B-Instruct"
}
```

Principais rotas (todas sob o prefixo `/api`, protegidas por JWT exceto as de auth):

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Autenticação |
| `GET` / `POST` / `DELETE` | `/documents` (+ `/:id`) | Biblioteca de documentos |
| `POST` | `/queries` | Pergunta síncrona (resposta + citações) |
| `GET` | `/queries/stream` | Resposta em streaming (SSE) |
| `GET` | `/queries` (+ `/:id`) | Histórico de perguntas |
| `GET` | `/health` | Healthcheck |

---

## Testes

```bash
npm run test -w api     # Vitest (backend)
npm run test -w web     # Vitest (frontend)

# Qualidade
npm run typecheck -w api && npm run lint -w api
npm run typecheck -w web && npm run lint -w web
```

Cobertura em pontos críticos: pipeline de ingestão, chunking, providers de
embedding/LLM, retrieval, geração com citações, streaming SSE, autenticação e os
componentes/stores do frontend.

---

## Limitações conhecidas

- **PDFs escaneados** (só imagem, sem camada de texto) não são suportados — o
  extrator não faz OCR, então a ingestão desses arquivos falha por "sem texto".
- **Reprocessar** um documento que falhou exige reenviar o arquivo: o binário
  original não é persistido após a ingestão.
- **Geração/embedding reais dependem de rede** e da disponibilidade dos modelos no
  provedor da Hugging Face; sem token, a app usa fakes determinísticos.
- **Streaming SSE** entrega a resposta em fragmentos a partir do texto completo
  (ainda não é token-a-token direto do provedor).
- **Dependências transitivas** têm avisos de `npm audit` cujo saneamento exige
  upgrades major do NestJS/Prisma (planejado como tarefa própria).

---

## Desenvolvimento assistido por IA

Este projeto foi construído de forma **incremental e assistida por IA**, por meio de
uma sequência de etapas numeradas — bootstrap da infra, autenticação, ingestão de
documentos, retrieval + LLM, streaming SSE, frontend, observabilidade/testes,
empacotamento Docker, revisão e release. Cada etapa foi implementada, testada e
validada antes de avançar para a próxima.

O fluxo de colaboração com o agente enfatiza TDD (RED → GREEN → refatora), correção
de causa raiz, commits por fatia vertical e uma revisão final em cinco eixos
(correção, legibilidade, arquitetura, segurança e performance) antes do merge. As
decisões de projeto ficam registradas como ADRs em `api/docs/adr/`, e o `DESIGN.md`
é a fonte de verdade visual (design tokens no estilo Duolingo).
