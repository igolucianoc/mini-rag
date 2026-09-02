# ADR 0004 — Estratégia de citações e "sem evidência suficiente"

Status: Aceito

## Context

Uma resposta RAG confiável precisa amarrar cada afirmação a uma fonte
verificável e recusar responder quando não há base suficiente, em vez de alucinar.

## Decision

**Amarração trecho -> fonte.** Cada chunk mantém `documentId`, `chunkIndex` e
offsets (`startOffset`/`endOffset`) no texto normalizado (ADR 0002). Ao montar a
resposta, os chunks recuperados viram `Citation` (`Source` + `rank`), persistidos
na tabela `Citation` (FK para `DocumentChunk`, com `rank`, `score` e `snippet`).
Assim toda citação aponta para o chunk exato que a embasou, com o trecho literal.

**Sinalização de evidência insuficiente.** Modelada em tipos, não em strings:

- `RetrievalResult` é uma discriminated union `sufficient | insufficient`. A
  recuperação é `insufficient` quando nenhum chunk atinge o limiar mínimo de
  similaridade (ou nada é recuperado), carregando um `reason`.
- `RagAnswer` é `answered | no_evidence`. Quando o retrieval é insuficiente, a
  resposta é `no_evidence` (texto padrão informando a ausência de base) e
  `Query.hadSufficientEvidence` é gravado como `false`.

## Consequences

- A UI e a persistência distinguem "respondido com fontes" de "sem evidência" sem
  parsing de texto; type guards (`isSufficientRetrieval`, `isAnsweredRag`) tornam
  o fluxo seguro em tempo de compilação.
- Exige definir e calibrar o limiar de similaridade (Etapa 06); começa
  configurável e é ajustável por observação.
- `Citation` duplica `snippet`/`score` do chunk para preservar a evidência
  histórica mesmo que o documento seja reprocessado depois.
