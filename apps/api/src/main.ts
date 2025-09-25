import { buildServer } from './server';
import { initializeTelemetry, shutdownTelemetry } from './telemetry';

initializeTelemetry();

async function start() {
  const app = await buildServer();

  let shuttingDown = false;
  const shutdown = async (signal?: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (signal) {
      app.log.info({ signal }, 'Received shutdown signal');
    }

    try {
      await app.close();
      app.log.info('HTTP server closed');
    } catch (error) {
      app.log.error({ err: error }, 'Failed to gracefully close the server');
    } finally {
      await shutdownTelemetry();
      process.exit(signal ? 0 : 1);
    }
  };

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    app.log.error({ err: error }, 'Uncaught exception');
    void shutdown();
  });

  try {
    await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    await shutdownTelemetry();
    process.exit(1);
  }
}

void start();
