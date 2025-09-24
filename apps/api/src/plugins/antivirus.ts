import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import * as clamd from 'clamdjs';
import { HttpProblemError } from '../lib/problem-details';

export type AntivirusScanStatus = 'clean' | 'infected' | 'skipped';

export interface AntivirusScanResult {
  status: AntivirusScanStatus;
  signature?: string;
  raw?: string;
}

export interface AntivirusScanner {
  readonly isEnabled: boolean;
  scanBuffer(buffer: Buffer): Promise<AntivirusScanResult>;
}

declare module 'fastify' {
  interface FastifyInstance {
    antivirus: AntivirusScanner;
  }

  interface FastifyRequest {
    antivirus: AntivirusScanner;
  }
}

const antivirusPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const {
    CLAMAV_ENABLED,
    CLAMAV_HOST,
    CLAMAV_PORT,
    CLAMAV_TIMEOUT_MS,
  } = fastify.config;

  const enabled = Boolean(CLAMAV_ENABLED);
  let scanner: clamd.Scanner | null = null;

  if (enabled) {
    if (!CLAMAV_HOST) {
      throw new Error('CLAMAV_HOST is required when CLAMAV_ENABLED is true.');
    }

    scanner = clamd.createScanner(CLAMAV_HOST, CLAMAV_PORT);
  }

  const antivirus: AntivirusScanner = {
    isEnabled: enabled,
    async scanBuffer(buffer: Buffer): Promise<AntivirusScanResult> {
      if (!enabled || !scanner) {
        return { status: 'skipped' };
      }

      try {
        const reply = await scanner.scanBuffer(buffer, CLAMAV_TIMEOUT_MS);
        if (clamd.isCleanReply(reply)) {
          return { status: 'clean' };
        }

        return { status: 'infected', signature: extractSignature(reply), raw: reply };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to scan uploaded file with ClamAV');
        throw new HttpProblemError({
          status: 503,
          title: 'ANTIVIRUS_UNAVAILABLE',
          detail: 'Unable to scan the uploaded file for viruses. Please try again later.',
        });
      }
    },
  };

  fastify.decorate('antivirus', antivirus);
  fastify.decorateRequest('antivirus', undefined as unknown as AntivirusScanner);

  fastify.addHook('onRequest', (request, _reply, done) => {
    request.antivirus = antivirus;
    done();
  });
});

function extractSignature(reply: string): string | undefined {
  const [, ...rest] = reply.split(':');
  if (rest.length === 0) {
    return undefined;
  }

  const joined = rest.join(':').trim();
  return joined.replace(/FOUND$/i, '').trim() || undefined;
}

export default antivirusPlugin;
