import { buildServer } from './server';

async function start() {
  const app = await buildServer();

  try {
    await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

void start();
