import { z } from 'zod';

const emptyStringToUndefined = <T>(schema: z.ZodType<T>) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional()
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-change-me-please-0123456789'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .default('dev-refresh-secret-change-me-please-0123456789'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REDIS_URL: emptyStringToUndefined(z.string().url()),
  S3_ACCESS_KEY_ID: z.string().default('local-access-key'),
  S3_SECRET_ACCESS_KEY: z.string().default('local-secret-key'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('local-bucket'),
  S3_ENDPOINT: emptyStringToUndefined(z.string().url()),
  S3_PUBLIC_URL: emptyStringToUndefined(z.string().url()),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: emptyStringToUndefined(z.string()),
  SMTP_PASSWORD: emptyStringToUndefined(z.string()),
  SMTP_FROM: z.string().email().default('no-reply@asso.local'),
  CLAMAV_ENABLED: z.coerce.boolean().default(false),
  CLAMAV_HOST: emptyStringToUndefined(z.string()),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('asso-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: emptyStringToUndefined(z.string().url()),
  OTEL_EXPORTER_OTLP_HEADERS: emptyStringToUndefined(z.string()),
  SENTRY_DSN: emptyStringToUndefined(z.string().url()),
  SENTRY_ENVIRONMENT: emptyStringToUndefined(z.string()),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type AppConfig = z.infer<typeof envSchema>;
export type RawEnvConfig = z.input<typeof envSchema>;

export function parseConfig(raw: RawEnvConfig): AppConfig {
  return envSchema.parse(raw);
}
