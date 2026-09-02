# ADR 0002 — Estratégia de chunking (tamanho e overlap)

Status: Aceito

## Context

Documentos precisam ser divididos em chunks antes de embedar. Chunks grandes
demais diluem a relevância na busca; pequenos demais perdem contexto. Estratégias
sofisticadas (split por sentença/semântico, tokenizer do modelo) agregam
complexidade e dependência de tokenizer externo, o que é overengineering para a
fase atual.

## Decision

Usar **janela deslizante por caracteres** com `chunkSize` e `overlap`
configuráveis (`chunkText`, função pura em `src/shared/rag/chunking`).

- Defaults de referência: `chunkSize = 1000` caracteres, `overlap = 200` (20%).
- Avanço por passo = `chunkSize - overlap`; chunks consecutivos compartilham
  `overlap` caracteres para não cortar contexto na fronteira.
- Contagem de tokens é aproximada por heurística (~4 chars/token); o valor exato
  do tokenizer pode ser adotado na Etapa 05 sem mudar o contrato.
- Cada chunk carrega `startOffset`/`endOffset` no texto normalizado, o que permite
  rastrear a origem do trecho para citações (ADR 0004).

## Consequences

- Determinística e testável sem dependências externas (cobre texto vazio, menor
  que o chunk e múltiplo exato).
- Pode cortar no meio de uma palavra/sentença; o overlap mitiga perda de contexto
  na recuperação.
- `chunkSize`/`overlap` são parâmetros: ajustáveis por documento/experimento sem
  alterar código.
