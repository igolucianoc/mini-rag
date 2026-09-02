import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '@/shared/validation/zod-validation.pipe';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CurrentUser } from '@/modules/auth/guards/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/guards/current-user.decorator';
import type { RagAnswer } from '@/shared/rag/domain/rag-types';
import { RagService } from '../application/rag.service';
import {
  QueryHistoryService,
  type QueryDetail,
  type QueryListItem,
} from '../application/query-history.service';
import {
  askQuestionBodySchema,
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
 *  - POST   /api/queries      -> faz a pergunta e retorna a resposta;
 *  - GET    /api/queries      -> histórico do usuário;
 *  - GET    /api/queries/:id  -> detalhe com citações (404 se não for dono).
 * O histórico serve ao frontend (Etapa 08). O SSE/streaming vem na Etapa 07.
 */
@Controller('queries')
@UseGuards(JwtAccessGuard)
export class QueryController {
  constructor(
    private readonly ragService: RagService,
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

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QueryListItem[]> {
    return this.historyService.listForUser(user.id);
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
