import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.hoisted(() => ({
  parseConfig: vi.fn(),
}));

const sdkState = vi.hoisted(() => ({
  instances: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
    options: unknown;
  }>,
  NodeSDK: vi.fn(function (options: unknown) {
    const instance = {
      start: vi.fn(),
      shutdown: vi.fn(),
      options,
    };
    sdkState.instances.push(instance);
    return instance;
  }),
}));

const diagMock = vi.hoisted(() => ({
  setLogger: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../config', () => ({
  parseConfig: configMock.parseConfig,
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: sdkState.NodeSDK,
}));

vi.mock('@opentelemetry/api', () => ({
  diag: diagMock,
  DiagConsoleLogger: class {},
  DiagLogLevel: { INFO: 'info', ERROR: 'error' },
}));

const resourceFromAttributesMock = vi.hoisted(() => vi.fn((attributes: unknown) => ({ attributes })));
vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: resourceFromAttributesMock,
}));

const exporterMock = vi.hoisted(() => vi.fn(function (options: unknown) {
  this.options = options;
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: exporterMock,
}));

const instrumentationMock = vi.hoisted(() => ({
  PrismaInstrumentation: vi.fn(() => 'prisma'),
}));
vi.mock('@prisma/instrumentation', () => instrumentationMock);

const autoInstrumentationMock = vi.hoisted(() => vi.fn(() => 'auto-instrumentations'));
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: autoInstrumentationMock,
}));

const baseConfig = {
  NODE_ENV: 'test',
  OTEL_ENABLED: false,
  OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
  OTEL_EXPORTER_OTLP_HEADERS: undefined,
  OTEL_SERVICE_NAME: 'asso-api',
  SENTRY_ENVIRONMENT: undefined,
};

describe('telemetry bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    configMock.parseConfig.mockReset();
    sdkState.instances.length = 0;
  });

  it('returns undefined when telemetry is disabled', async () => {
    configMock.parseConfig.mockReturnValue({ ...baseConfig, OTEL_ENABLED: false });

    const telemetry = await import('../telemetry');
    const result = telemetry.initializeTelemetry();

    expect(result).toBeUndefined();
    expect(diagMock.setLogger).not.toHaveBeenCalled();
    expect(sdkState.NodeSDK).not.toHaveBeenCalled();
  });

  it('starts the NodeSDK when enabled and supports shutdown', async () => {
    configMock.parseConfig.mockReturnValue({
      ...baseConfig,
      NODE_ENV: 'development',
      OTEL_ENABLED: true,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com/v1/traces',
      OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer 123, X-Custom = abc=def',
      SENTRY_ENVIRONMENT: 'staging',
    });

    const telemetry = await import('../telemetry');
    const sdk = telemetry.initializeTelemetry();

    expect(diagMock.setLogger).toHaveBeenCalledWith(expect.any(Object), 'info');
    expect(autoInstrumentationMock).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: expect.any(Function),
      },
    });

    expect(sdkState.NodeSDK).toHaveBeenCalledTimes(1);
    const [[options]] = sdkState.NodeSDK.mock.calls as unknown as [[{
      resource: unknown;
      traceExporter: unknown;
      instrumentations: unknown;
    }]];
    const { resource, traceExporter, instrumentations } = options;

    expect(resource).toEqual({
      attributes: {
        'service.name': 'asso-api',
        'deployment.environment': 'staging',
      },
    });

    expect(traceExporter).toMatchObject({
      options: {
        url: 'https://otel.example.com/v1/traces',
        headers: {
          Authorization: 'Bearer 123',
          'X-Custom': 'abc=def',
        },
      },
    });

    expect(instrumentations).toEqual([expect.anything(), 'auto-instrumentations']);
    expect(instrumentationMock.PrismaInstrumentation).toHaveBeenCalled();

    expect(exporterMock).toHaveBeenCalledWith({
      url: 'https://otel.example.com/v1/traces',
      headers: {
        Authorization: 'Bearer 123',
        'X-Custom': 'abc=def',
      },
    });

    expect(sdk).toBe(sdkState.instances[0]);
    expect(sdkState.instances[0].start).toHaveBeenCalled();

    sdkState.instances[0].shutdown.mockResolvedValue(undefined);
    await telemetry.shutdownTelemetry();
    expect(sdkState.instances[0].shutdown).toHaveBeenCalled();
  });

  it('logs an error when shutdown fails', async () => {
    configMock.parseConfig.mockReturnValue({ ...baseConfig, OTEL_ENABLED: true });

    const telemetry = await import('../telemetry');
    telemetry.initializeTelemetry();

    sdkState.instances[0].shutdown.mockRejectedValue(new Error('timeout'));
    await telemetry.shutdownTelemetry();

    expect(diagMock.error).toHaveBeenCalledWith(
      'Failed to shutdown OpenTelemetry SDK',
      expect.any(Error),
    );
  });
});
