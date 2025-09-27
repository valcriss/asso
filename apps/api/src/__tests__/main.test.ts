import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeTelemetryMock = vi.hoisted(() => vi.fn());
const shutdownTelemetryMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../telemetry', () => ({
  initializeTelemetry: initializeTelemetryMock,
  shutdownTelemetry: shutdownTelemetryMock,
}));

const listenMock = vi.hoisted(() => vi.fn(async () => {}));
const closeMock = vi.hoisted(() => vi.fn(async () => {}));
const logInfoMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

const buildServerMock = vi.hoisted(() =>
  vi.fn(async () => ({
    listen: listenMock,
    close: closeMock,
    log: { info: logInfoMock, error: logErrorMock },
    config: { PORT: 3000 },
  })),
);

vi.mock('../server', () => ({
  buildServer: buildServerMock,
}));

describe('main bootstrap', () => {
  type ShutdownHandler = () => void;
  type UnhandledRejectionHandler = (reason: unknown) => void;
  type UncaughtExceptionHandler = (error: Error) => void;

  const signalHandlers: {
    SIGINT?: ShutdownHandler;
    SIGTERM?: ShutdownHandler;
    unhandledRejection?: UnhandledRejectionHandler;
    uncaughtException?: UncaughtExceptionHandler;
  } = {};
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let onSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of Object.keys(signalHandlers) as Array<keyof typeof signalHandlers>) {
      delete signalHandlers[key];
    }

    listenMock.mockImplementation(async () => {});
    closeMock.mockImplementation(async () => {});
    shutdownTelemetryMock.mockImplementation(async () => {});

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation((event: NodeJS.Signals | 'unhandledRejection' | 'uncaughtException', handler: (...args: unknown[]) => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          signalHandlers[event] = handler as ShutdownHandler;
        } else if (event === 'unhandledRejection') {
          signalHandlers.unhandledRejection = handler as UnhandledRejectionHandler;
        } else if (event === 'uncaughtException') {
          signalHandlers.uncaughtException = handler as UncaughtExceptionHandler;
        }
        return process;
      });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('initializes telemetry, starts the server, and registers signal handlers', async () => {
    const mainModule = await import('../main');
    expect(mainModule).toBeDefined();

    await vi.waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    expect(buildServerMock).toHaveBeenCalledTimes(1);
    expect(initializeTelemetryMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });

    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

    signalHandlers.unhandledRejection?.(new Error('boom'));
    expect(logErrorMock).toHaveBeenCalledWith({ err: expect.any(Error) }, 'Unhandled promise rejection');

    signalHandlers.SIGTERM?.();
    await vi.waitFor(() => {
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(shutdownTelemetryMock).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  it('shuts down telemetry and exits when listen fails', async () => {
    listenMock.mockRejectedValueOnce(new Error('listen failed'));

    await import('../main');

    await vi.waitFor(() => {
      expect(shutdownTelemetryMock).toHaveBeenCalled();
    });

    expect(logErrorMock).toHaveBeenCalledWith(expect.any(Error), 'Failed to start server');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
