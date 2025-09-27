import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const dotenvConfigMock = vi.hoisted(() => vi.fn());
const defineConfigMock = vi.hoisted(() => vi.fn((value) => ({ configured: true, value })));

vi.mock('dotenv', () => ({
  default: { config: dotenvConfigMock },
}));

vi.mock('prisma/config', () => ({
  defineConfig: defineConfigMock,
}));

describe('prisma config bootstrap', () => {
  it('loads root .env and exports the prisma configuration', async () => {
    const configModule = await import('../../prisma.config');

    expect(dotenvConfigMock).toHaveBeenCalledWith({
      path: expect.stringContaining(`${path.sep}.env`),
    });

    expect(defineConfigMock).toHaveBeenCalledWith({
      schema: expect.stringContaining(`prisma${path.sep}schema.prisma`),
      migrations: {
        path: expect.stringContaining(`prisma${path.sep}migrations`),
        seed: 'tsx prisma/seed.ts',
      },
    });

    expect(configModule.default).toEqual({ configured: true, value: defineConfigMock.mock.calls[0][0] });
  });
});
