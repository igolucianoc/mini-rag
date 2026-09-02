# ADR 0003 — Similaridade por cosseno e topK default

Status: Aceito

## Context

A recuperação precisa ordenar chunks por proximidade semântica ao embedding da
pergunta. O pgvector oferece distância L2 (`<->`), produto interno (`<#>`) e
distância de cosseno (`<=>`). O modelo `all-MiniLM-L6-v2` produz embeddings cuja
similaridade é convencionalmente medida por cosseno.

## Decision

- Usar **similaridade de cosseno**. No pgvector, o operador é `<=>` (distância de
  cosseno, `0` = idêntico) com o operador de índice `vector_cosine_ops`. A
  pontuação exposta no domínio (`ScoredChunk.score`) é normalizada para `[0, 1]`
  via `score = 1 - distância`.
- `topK` **default = 5** (constante `DEFAULT_TOP_K`), sobrescrevível por chamada.
- Filtros de busca por `userId` e `documentIds` são aplicados no mesmo SQL, antes
  do ranking, garantindo isolamento por dono e escopo por documento.

## Consequences

- O índice de similaridade (ADR 0001) deve usar `vector_cosine_ops` para ser
  aproveitado pelo operador `<=>`.
- `topK = 5` equilibra recall e tamanho de prompt; ajustável por chamada quando
  uma pergunta exigir mais evidência.
- A normalização L2 dos embeddings (real e fake do seed) mantém cosseno e produto
  interno coerentes.
