import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export class AccountError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
let hashing = 0;
async function passwordWork<T>(work: () => Promise<T>): Promise<T> {
  if (hashing >= 2) throw new AccountError(429, 'Слишком много запросов. Попробуйте немного позже.');
  hashing++;
  try { return await work(); } finally { hashing--; }
}
export const hashPassword = (password: string) => passwordWork(() => hash(password, {
  algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, // Argon2id
}));
export const verifyPassword = (encoded: string, password: string) => passwordWork(() => verify(encoded, password));
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const csrfToken = (token: string) => tokenHash(`stickerboard:csrf:${token}`);
export function equalToken(actual: unknown, expected: string): boolean {
  return typeof actual === 'string' && /^[0-9a-f]{64}$/.test(actual)
    && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
