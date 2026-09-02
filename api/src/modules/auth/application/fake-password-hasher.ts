import type { PasswordHasher } from './password-hasher';

/**
 * Hasher fake para testes: determinístico e sem custo de CPU. NÃO usar em
 * produção — o "hash" é apenas o texto com um prefixo reconhecível.
 */
export class FakePasswordHasher implements PasswordHasher {
  private static readonly PREFIX = 'fake-hash::';

  hash(plain: string): Promise<string> {
    return Promise.resolve(`${FakePasswordHasher.PREFIX}${plain}`);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return Promise.resolve(hash === `${FakePasswordHasher.PREFIX}${plain}`);
  }
}
