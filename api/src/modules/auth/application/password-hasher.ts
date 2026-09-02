import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Porta de hashing de senha. O domínio (AuthService) depende desta interface,
 * nunca do SDK concreto — assim a lib de hash pode ser trocada e os testes usam
 * uma implementação fake sem custo de CPU.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /** Comparação em tempo constante (garantida pela lib) contra timing attacks. */
  verify(hash: string, plain: string): Promise<boolean>;
}

/** Token de injeção para a porta (interfaces somem em runtime no TS). */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/**
 * Implementação com argon2id. Escolhido sobre bcrypt por ser o vencedor da
 * Password Hashing Competition e resistente a ataques por GPU/ASIC graças ao
 * custo de memória. `argon2.verify` já compara em tempo constante e lida com o
 * salt embutido no encoded hash.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash malformado/incompatível não deve vazar como 500 nem revelar detalhe.
      return false;
    }
  }
}
