import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  verify: vi.fn(),
  argon2id: Symbol('argon2id'),
}));

vi.mock('argon2', () => ({
  default: {
    hash: mocks.hash,
    verify: mocks.verify,
    argon2id: mocks.argon2id,
  },
}));

import { hashPassword, verifyPassword } from '../password';

describe('password helpers', () => {
  it('hashes passwords using argon2id profile', async () => {
    mocks.hash.mockResolvedValue('hashed');

    const result = await hashPassword('secret');

    expect(mocks.hash).toHaveBeenCalledWith('secret', { type: mocks.argon2id });
    expect(result).toBe('hashed');
  });

  it('verifies password hashes and returns false on failure', async () => {
    mocks.verify.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('invalid'));

    await expect(verifyPassword('hash', 'secret')).resolves.toBe(true);
    await expect(verifyPassword('hash', 'secret')).resolves.toBe(false);
  });
});
