import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaSeedState = vi.hoisted(() => ({
  existingOrg: false,
  userExists: false,
  roleExists: false,
  idCounter: 0,
  prismaInstance: null as null | any,
  txClient: null as null | any,
}));

const createId = (prefix: string): string => `${prefix}-${++prismaSeedState.idCounter}`;

class MockTransactionClient {
  public readonly $executeRaw = vi.fn(async () => {});

  public readonly account = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('account'), ...data })),
  };

  public readonly journal = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('journal'), ...data })),
  };

  public readonly fiscalYear = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('fiscalYear'), ...data })),
  };

  public readonly bankAccount = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('bankAccount'), ...data })),
  };

  public readonly member = {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
  };

  public readonly entry = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('entry'), ...data })),
  };

  public readonly donation = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('donation'), ...data })),
  };

  public readonly bankStatement = {
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: createId('bankStatement'), ...data })),
  };
}

class MockPrismaClient {
  public readonly organization = {
    findFirst: vi.fn(async () => (prismaSeedState.existingOrg ? { id: 'existing-org' } : null)),
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'org-demo', ...data })),
  };

  public readonly user = {
    findUnique: vi.fn(async () => (prismaSeedState.userExists ? { id: 'user-1' } : null)),
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'user-1', ...data })),
  };

  public readonly userOrgRole = {
    findFirst: vi.fn(async () => (prismaSeedState.roleExists ? { id: 'role-1' } : null)),
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'role-1', ...data })),
  };

  public readonly $transaction = vi.fn(async (callback: (tx: MockTransactionClient) => Promise<unknown>) => {
    const tx = new MockTransactionClient();
    prismaSeedState.txClient = tx;
    return callback(tx);
  });

  public readonly $disconnect = vi.fn(async () => {});

  public constructor() {
    prismaSeedState.prismaInstance = this;
  }
}

vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client');
  return {
    PrismaClient: MockPrismaClient,
    Prisma: actual.Prisma,
  };
});

vi.mock('argon2', () => ({
  default: {
    hash: vi.fn(async () => 'hashed'),
    argon2id: Symbol('argon2id'),
  },
}));

describe('prisma seed script', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    prismaSeedState.existingOrg = false;
    prismaSeedState.userExists = false;
    prismaSeedState.roleExists = false;
    prismaSeedState.idCounter = 0;
    prismaSeedState.prismaInstance = null;
    prismaSeedState.txClient = null;
    vi.resetModules();
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('skips seeding when demo tenant already exists', async () => {
    prismaSeedState.existingOrg = true;
    prismaSeedState.userExists = true;
    prismaSeedState.roleExists = true;

    await import('../../prisma/seed');

    await vi.waitFor(() => {
      expect(prismaSeedState.prismaInstance?.organization.create).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'La donnée de démonstration existe déjà, vérification de l’utilisateur admin...',
      );
    });

    expect(prismaSeedState.prismaInstance?.user.create).not.toHaveBeenCalled();
    expect(prismaSeedState.prismaInstance?.userOrgRole.create).not.toHaveBeenCalled();
  });

  it('creates demo data when tenant is missing', async () => {
    await import('../../prisma/seed');

    await vi.waitFor(() => {
      expect(prismaSeedState.prismaInstance?.organization.create).toHaveBeenCalled();
      expect(prismaSeedState.txClient?.account.create).toHaveBeenCalled();
      expect(prismaSeedState.txClient?.journal.create).toHaveBeenCalled();
      expect(prismaSeedState.txClient?.fiscalYear.create).toHaveBeenCalled();
      expect(prismaSeedState.txClient?.entry.create).toHaveBeenCalled();
    });

    expect(prismaSeedState.prismaInstance?.user.create).toHaveBeenCalled();
    expect(prismaSeedState.prismaInstance?.userOrgRole.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'ADMIN' }),
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Tenant de démonstration créé avec succès (utilisateur admin@admin.com disponible).',
    );
  });
});
