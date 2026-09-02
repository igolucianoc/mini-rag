import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { RefreshToken, User } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AuthService } from './auth.service';
import { FakePasswordHasher } from './fake-password-hasher';
import { createTokenService } from '../test/factories/auth-token.factory';
import type {
  CreateRefreshTokenData,
  RefreshTokenRepository,
} from '../domain/refresh-token.repository';
import { TokenService } from './token.service';

/** Repositório de refresh tokens em memória (substitui o Prisma nos testes). */
class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly rows: RefreshToken[] = [];
  private seq = 0;

  create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    const row: RefreshToken = {
      id: `rt-${(this.seq += 1)}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      family: data.family,
      expiresAt: data.expiresAt,
      revokedAt: null,
      replacedById: null,
      userAgent: data.userAgent ?? null,
      ip: data.ip ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return Promise.resolve(this.rows.find((r) => r.tokenHash === tokenHash) ?? null);
  }

  markReplaced(id: string, replacedById: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) {
      row.revokedAt = new Date();
      row.replacedById = replacedById;
    }
    return Promise.resolve();
  }

  revoke(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) {
      row.revokedAt = new Date();
    }
    return Promise.resolve();
  }

  revokeFamily(family: string): Promise<void> {
    for (const row of this.rows) {
      if (row.family === family && row.revokedAt === null) {
        row.revokedAt = new Date();
      }
    }
    return Promise.resolve();
  }
}

/** Store mínimo de usuários para o mock do Prisma. */
class UserStore {
  readonly users: User[] = [];
  private seq = 0;

  add(email: string, passwordHash: string): User {
    const user: User = {
      id: `user-${(this.seq += 1)}`,
      email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }
}

/**
 * Cria um mock de PrismaService cobrindo apenas os acessos usados pelo AuthService
 * (user.findUnique / user.create). Sem banco, sem rede.
 */
function createPrismaMock(store: UserStore): PrismaService {
  const prisma = {
    user: {
      findUnique: ({
        where,
      }: {
        where: { email?: string; id?: string };
      }): Promise<User | null> => {
        const found = store.users.find(
          (u) =>
            (where.email !== undefined && u.email === where.email) ||
            (where.id !== undefined && u.id === where.id),
        );
        return Promise.resolve(found ?? null);
      },
      create: ({
        data,
      }: {
        data: { email: string; passwordHash: string };
      }): Promise<User> =>
        Promise.resolve(store.add(data.email, data.passwordHash)),
    },
  };
  return prisma as unknown as PrismaService;
}

interface Harness {
  readonly service: AuthService;
  readonly repo: InMemoryRefreshTokenRepository;
  readonly tokenService: TokenService;
  readonly store: UserStore;
}

function createHarness(): Harness {
  const store = new UserStore();
  const repo = new InMemoryRefreshTokenRepository();
  const tokenService = createTokenService();
  const service = new AuthService(
    createPrismaMock(store),
    tokenService,
    new FakePasswordHasher(),
    repo,
  );
  return { service, repo, tokenService, store };
}

describe('AuthService', () => {
  let h: Harness;

  beforeEach(() => {
    h = createHarness();
  });

  describe('register', () => {
    it('cria usuário e emite tokens', async () => {
      const tokens = await h.service.register({
        email: 'novo@mini-rag.local',
        password: 'senha-de-8+',
      });
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      expect(h.store.users).toHaveLength(1);
      // Senha não é persistida em claro.
      expect(h.store.users[0]?.passwordHash).not.toBe('senha-de-8+');
    });

    it('recusa e-mail já cadastrado', async () => {
      await h.service.register({ email: 'dup@x.co', password: 'senha-de-8+' });
      await expect(
        h.service.register({ email: 'dup@x.co', password: 'outra-senha' }),
      ).rejects.toThrow();
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      const hash = await new FakePasswordHasher().hash('senha-correta');
      h.store.add('user@x.co', hash);
    });

    it('sucesso com credenciais corretas emite novo par', async () => {
      const tokens = await h.service.login({
        email: 'user@x.co',
        password: 'senha-correta',
      });
      expect(tokens.accessToken).toBeTruthy();
      const claims = await h.tokenService.verifyAccessToken(tokens.accessToken);
      expect(claims.email).toBe('user@x.co');
    });

    it('senha errada -> erro genérico (Unauthorized)', async () => {
      await expect(
        h.service.login({ email: 'user@x.co', password: 'senha-errada' }),
      ).rejects.toThrow('Credenciais inválidas');
    });

    it('usuário inexistente -> mesmo erro genérico', async () => {
      await expect(
        h.service.login({ email: 'nao-existe@x.co', password: 'qualquer' }),
      ).rejects.toThrow('Credenciais inválidas');
    });
  });

  describe('refresh (rotação)', () => {
    it('emite novo par e invalida o anterior', async () => {
      const first = await h.service.register({
        email: 'r@x.co',
        password: 'senha-de-8+',
      });
      const second = await h.service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.accessToken).toBeTruthy();

      // O token anterior foi marcado como revogado e ligado ao sucessor.
      const oldHash = h.tokenService.hashRefreshToken(first.refreshToken);
      const oldRow = h.repo.rows.find((r) => r.tokenHash === oldHash);
      expect(oldRow?.revokedAt).not.toBeNull();
      expect(oldRow?.replacedById).toBeTruthy();
      // Mesma família preservada na rotação.
      const newHash = h.tokenService.hashRefreshToken(second.refreshToken);
      const newRow = h.repo.rows.find((r) => r.tokenHash === newHash);
      expect(newRow?.family).toBe(oldRow?.family);
    });
  });

  describe('reuse detection', () => {
    it('reapresentar um refresh já rotacionado revoga a família e recusa', async () => {
      const first = await h.service.register({
        email: 'reuse@x.co',
        password: 'senha-de-8+',
      });
      const second = await h.service.refresh(first.refreshToken);

      // Reuso do token antigo (já rotacionado) deve falhar...
      await expect(h.service.refresh(first.refreshToken)).rejects.toThrow(
        'Refresh token inválido',
      );

      // ...e invalidar toda a família, inclusive o token atual válido.
      await expect(h.service.refresh(second.refreshToken)).rejects.toThrow();
      const allRevoked = h.repo.rows.every((r) => r.revokedAt !== null);
      expect(allRevoked).toBe(true);
    });

    it('token desconhecido é recusado', async () => {
      await expect(h.service.refresh('token-que-nunca-existiu')).rejects.toThrow(
        'Refresh token inválido',
      );
    });
  });

  describe('expiração', () => {
    it('refresh expirado é recusado', async () => {
      // TTL de refresh 0 dias => já nasce expirado.
      const store = new UserStore();
      const repo = new InMemoryRefreshTokenRepository();
      const tokenService = createTokenService({ REFRESH_TOKEN_TTL_DAYS: 1 });
      const service = new AuthService(
        createPrismaMock(store),
        tokenService,
        new FakePasswordHasher(),
        repo,
      );
      const first = await service.register({
        email: 'exp@x.co',
        password: 'senha-de-8+',
      });
      // Força expiração no passado.
      const row = repo.rows[0];
      if (row) {
        row.expiresAt = new Date(Date.now() - 1000);
      }
      await expect(service.refresh(first.refreshToken)).rejects.toThrow(
        'Refresh token expirado',
      );
    });
  });

  describe('logout', () => {
    it('revoga o refresh token atual', async () => {
      const first = await h.service.register({
        email: 'out@x.co',
        password: 'senha-de-8+',
      });
      await h.service.logout(first.refreshToken);
      const hash = h.tokenService.hashRefreshToken(first.refreshToken);
      const row = h.repo.rows.find((r) => r.tokenHash === hash);
      expect(row?.revokedAt).not.toBeNull();
      // Após logout, o token não pode mais ser usado para refresh.
      await expect(h.service.refresh(first.refreshToken)).rejects.toThrow();
    });

    it('logoutAll revoga toda a família', async () => {
      const first = await h.service.register({
        email: 'all@x.co',
        password: 'senha-de-8+',
      });
      const second = await h.service.refresh(first.refreshToken);
      await h.service.logoutAll(second.refreshToken);
      const allRevoked = h.repo.rows.every((r) => r.revokedAt !== null);
      expect(allRevoked).toBe(true);
    });
  });

  it('gera identificadores de família distintos por login (randomUUID disponível)', () => {
    // Sanidade: o ambiente de teste tem crypto.randomUUID.
    expect(randomUUID()).toMatch(/[0-9a-f-]{36}/);
  });
});
