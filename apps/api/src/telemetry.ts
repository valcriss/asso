import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { parseConfig, type RawEnvConfig } from './config';

let sdk: NodeSDK | undefined;

const SHUTDOWN_TIMEOUT_MS = 5000;

export function initializeTelemetry(): NodeSDK | undefined {
  if (sdk) {
    return sdk;
  }

  const config = parseConfig(process.env as unknown as RawEnvConfig);

  if (!config.OTEL_ENABLED) {
    return undefined;
  }

  const diagLogLevel = config.NODE_ENV === 'development' ? DiagLogLevel.INFO : DiagLogLevel.ERROR;
  diag.setLogger(new DiagConsoleLogger(), diagLogLevel);

  const exporterOptions: ConstructorParameters<typeof OTLPTraceExporter>[0] = {};

  if (config.OTEL_EXPORTER_OTLP_ENDPOINT) {
    exporterOptions.url = config.OTEL_EXPORTER_OTLP_ENDPOINT;
  }

  if (config.OTEL_EXPORTER_OTLP_HEADERS) {
    exporterOptions.headers = parseHeaders(config.OTEL_EXPORTER_OTLP_HEADERS);
  }

  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: config.OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter(exporterOptions),
    instrumentations: [
      new PrismaInstrumentation(),
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) => {
            const url = request.url ?? '';
            return ['/health', '/healthz', '/metrics'].some((path) => url.startsWith(path));
          },
        },
      }),
    ],
  });

  try {
    sdk.start();
    diag.debug('OpenTelemetry SDK started');
  } catch (error) {
    diag.error('Failed to start OpenTelemetry SDK', error as Error);
  }

  return sdk;
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenTelemetry shutdown timeout')), SHUTDOWN_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    diag.error('Failed to shutdown OpenTelemetry SDK', error as Error);
  } finally {
    sdk = undefined;
  }
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  return rawHeaders
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .reduce<Record<string, string>>((headers, entry) => {
      const [key, ...rest] = entry.split('=');
      if (!key) {
        return headers;
      }

      const value = rest.join('=').trim();
      if (!value) {
        return headers;
      }

      headers[key.trim()] = value;
      return headers;
    }, {});
}
