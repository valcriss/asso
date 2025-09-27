import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = { info: vi.fn(), error: vi.fn() };

const pinoMock = vi.hoisted(() => vi.fn(() => logger));
vi.mock('pino', () => ({ default: pinoMock }));

const prismaConnectMock = vi.hoisted(() => vi.fn(async () => {}));
const prismaDisconnectMock = vi.hoisted(() => vi.fn(async () => {}));

const prismaClientMock = vi.hoisted(() =>
  vi.fn(() => ({
    $connect: prismaConnectMock,
    $disconnect: prismaDisconnectMock,
  }))
);

vi.mock('@prisma/client', () => ({ PrismaClient: prismaClientMock }));

const registerScheduledJobsMock = vi.hoisted(() => vi.fn(async () => {}));
const closeRunnerMock = vi.hoisted(() => vi.fn(async () => {}));

const jobRunnerMock = vi.hoisted(() =>
  vi.fn(() => ({
    registerScheduledJobs: registerScheduledJobsMock,
    close: closeRunnerMock,
  }))
);

vi.mock('../runner', () => ({ JobRunner: jobRunnerMock }));

const createJobDefinitionsMock = vi.hoisted(() => vi.fn(() => ['job']));
vi.mock('../definitions', () => ({ createJobDefinitions: createJobDefinitionsMock }));

const originalEnv = { ...process.env };

describe('jobs worker bootstrap', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let onceSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    onceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    onceSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  it('connects dependencies and schedules jobs with defaults', async () => {
    delete process.env.REDIS_URL;
    delete process.env.JOBS_TIMEZONE;

    await import('../worker');
    await vi.waitFor(() => {
      expect(registerScheduledJobsMock).toHaveBeenCalled();
    });

    expect(pinoMock).toHaveBeenCalledWith({ level: 'info' });
    expect(prismaClientMock).toHaveBeenCalled();
    expect(prismaConnectMock).toHaveBeenCalled();
    expect(jobRunnerMock).toHaveBeenCalledWith({
      connection: { url: 'redis://127.0.0.1:6379' },
      logger,
      defaultTimezone: 'Europe/Paris',
    });
    expect(createJobDefinitionsMock).toHaveBeenCalledWith({
      logger,
      timezone: 'Europe/Paris',
      prisma: expect.any(Object),
    });
    expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('logs and exits when job initialization fails', async () => {
    createJobDefinitionsMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await import('../worker');

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to start jobs worker',
        expect.any(Error),
      );
    });

    expect(prismaDisconnectMock).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(registerScheduledJobsMock).not.toHaveBeenCalled();
  });
});
