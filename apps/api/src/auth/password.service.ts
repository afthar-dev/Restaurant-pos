import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  /** Hash of a throwaway value, so unknown-user logins cost the same time as real ones. */
  private readonly dummyHash = hash('timing-equaliser-not-a-real-password');

  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(storedHash: string | null | undefined, plain: string): Promise<boolean> {
    if (!storedHash) {
      await verify(await this.dummyHash, plain).catch(() => false);
      return false;
    }
    return verify(storedHash, plain).catch(() => false);
  }
}
