import { describe, it, expect } from 'vitest';
import { Argon2PasswordHasher } from './password-hasher';
import { FakePasswordHasher } from './fake-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('gera um hash diferente do texto puro', async () => {
    const hash = await hasher.hash('senha-super-secreta');
    expect(hash).not.toBe('senha-super-secreta');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verify retorna true para a senha correta e false para a errada', async () => {
    const hash = await hasher.hash('senha-correta');
    await expect(hasher.verify(hash, 'senha-correta')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'senha-errada')).resolves.toBe(false);
  });

  it('verify retorna false (sem lançar) para hash malformado', async () => {
    await expect(hasher.verify('nao-e-um-hash', 'x')).resolves.toBe(false);
  });
});

describe('FakePasswordHasher', () => {
  const hasher = new FakePasswordHasher();

  it('hash difere do texto puro e verify casa apenas com o original', async () => {
    const hash = await hasher.hash('abc');
    expect(hash).not.toBe('abc');
    await expect(hasher.verify(hash, 'abc')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'xyz')).resolves.toBe(false);
  });
});
