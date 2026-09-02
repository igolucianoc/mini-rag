import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { from, map, type Observable } from 'rxjs';
import { ZodValidationPipe } from '@/shared/validation/zod-validation.pipe';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CurrentUser } from '@/modules/auth/guards/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/guards/current-user.decorator';
import type { RagAnswer } from '@/shared/rag/domain/rag-types';
import { RagService } from '../application/rag.service';
import { RagStreamService } from '../application/rag-stream.service';
import type { RagStreamEvent } from '../application/rag-stream.events';
import {
  QueryHistoryService,
  type QueryDetail,
  type QueryListItem,
} from '../application/query-history.service';
import {
  askQuestionBodySchema,
  askQuestionStreamQuerySchema,
  queryIdParamSchema,
  type AskQuestionBody,
  type QueryIdParam,
} from '../schemas/query.schema';

/** Resposta do POST de pergunta: RagAnswer + metadados. */
interface AskResponse {
  readonly queryId: string;
  readonly answer: RagAnswer;
  readonly hadSufficientEvidence: boolean;
  readonly modelId: string | null;
  readonly latencyMs: number;
}

/**
 * Rotas de perguntas (RAG), todas protegidas por JwtAccessGuard — o dono é
 * sempre o usuário autenticado.
 *
 * DECISÃO de rota: unificamos criação e histórico sob `queries` (REST):
 *  - POST   /api/queries          -> faz a pergunta síncrona e retorna a resposta;
 *  - GET    /api/queries/stream   -> streaming SSE da resposta (Etapa 07);
 *  - GET    /api/queries          -> histórico do usuário;
 *  - GET    /api/queries/:id      -> detalhe com citações (404 se não for dono).
 * O histórico serve ao frontend (Etapa 08).
 */
@Controller('queries')
@UseGuards(JwtAccessGuard)
export class QueryController {
  constructor(
    private readonly ragService: RagService,
    private readonly ragStreamService: RagStreamService,
    private readonly historyService: QueryHistoryService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async ask(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<AskQuestionBody>(askQuestionBodySchema))
    body: AskQuestionBody,
  ): Promise<AskResponse> {
    const result = await this.ragService.ask({
      userId: user.id,
      question: body.question,
      topK: body.topK,
      documentIds: body.documentIds,
    });

    return {
      queryId: result.queryId,
      answer: result.answer,
      hadSufficientEvidence: result.hadSufficientEvidence,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
    };
  }

  /**
   * Streaming da resposta via SSE (Server-Sent Events), NÃO WebSocket.
   *
   * DECISÃO de auth/params (Opção A):
   *  - Método GET com os parâmetros (`question`, `topK?`, `documentIds?`) na
   *    query string, validados por Zod (`askQuestionStreamQuerySchema`).
   *  - Autenticação mantida pelo `JwtAccessGuard` normal, via header
   *    `Authorization: Bearer <token>`. NÃO aceitamos token na query string:
   *    URLs vazam em logs/proxies/histórico — colocar o access token ali seria
   *    um risco de segurança. Consequência: o `EventSource` nativo do navegador
   *    NÃO serve (não envia headers), então o cliente (Etapa 08) deve consumir
   *    este endpoint via fetch streaming (fetch + ReadableStream), que permite
   *    enviar o header Authorization. O CORS já está com credentials=true.
   *  - O `@Sse()` do Nest cuida dos headers `text/event-stream` e serializa cada
   *    `MessageEvent.data` em JSON.
   *
   * PONTE async-generator -> Observable<MessageEvent>: o service expõe um async
   * generator de `RagStreamEvent` (puro, testável sem o Nest); aqui adaptamos com
   * `from()` do rxjs sobre o async iterable e `map()` cada evento para
   * `{ data: evento }`. O Nest serializa `data` como JSON no campo `data:` do SSE.
   */
  @Sse('stream')
  stream(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: unknown,
  ): Observable<MessageEvent> {
    const parsed = askQuestionStreamQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Dados de entrada inválidos',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const events = this.ragStreamService.askStream({
      userId: user.id,
      question: parsed.data.question,
      topK: parsed.data.topK,
      documentIds: parsed.data.documentIds,
    });

    return from(events).pipe(
      map((event: RagStreamEvent): MessageEvent => ({ data: event })),
    );
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QueryListItem[]> {
    return this.historyService.listForUser(user.id);
  }

  /**
   * Limpa TODO o histórico de perguntas do usuário autenticado. Delete-all
   * escopado por `userId`; as citações somem por cascade. Idempotente (204
   * mesmo que o histórico já esteja vazio).
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.historyService.deleteAllForUser(user.id);
  }

  @Get(':id')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe<QueryIdParam>(queryIdParamSchema))
    params: QueryIdParam,
  ): Promise<QueryDetail> {
    return this.historyService.getForUser(user.id, params.id);
  }
}
