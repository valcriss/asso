#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// Charge le .env racine avant de lancer les workspaces afin que ses variables
// soient propagées aux processus enfants (API + Web). Cela évite d'avoir à
// dupliquer le fichier dans chaque sous‑projet pendant le développement.
loadEnv({ path: resolve(process.cwd(), '.env') });

const services = [
  { name: 'api', command: 'npm run dev --workspace @asso/api' },
  { name: 'web', command: 'npm run dev --workspace @asso/web' },
];

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function startService({ name, command }) {
  const child = spawn(command, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  children.set(name, child);

  child.on('exit', (code, signal) => {
    children.delete(name);
    const childCode = typeof code === 'number' ? code : signal ? 1 : 0;

    if (!shuttingDown) {
      exitCode = childCode;
      log(`[dev] ${name} stopped (${signal ?? childCode}). Stopping remaining services...`);
      shutdown();
      return;
    }

    if (children.size === 0) {
      process.exit(exitCode);
    }
  });

  child.on('error', (error) => {
    log(`[dev] Failed to start ${name}: ${error.message}`);
    exitCode = 1;
    shutdown();
  });
}

function shutdown(signal) {
  if (shuttingDown) {
    if (children.size === 0) {
      process.exit(exitCode);
    }
    return;
  }

  shuttingDown = true;

  if (signal) {
    log(`[dev] Received ${signal}, stopping services...`);
  }

  for (const [name, child] of children.entries()) {
    if (!child.killed) {
      child.kill('SIGTERM');
      log(`[dev] Sent SIGTERM to ${name}`);
    }
  }

  setTimeout(() => {
    for (const [name, child] of children.entries()) {
      if (!child.killed) {
        child.kill('SIGKILL');
        log(`[dev] Forced kill for ${name}`);
      }
    }
  }, 5000).unref();
}

function log(message) {
  console.log(message);
}

for (const service of services) {
  startService(service);
}

process.on('SIGINT', () => {
  exitCode = 0;
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  exitCode = 0;
  shutdown('SIGTERM');
});

process.on('exit', () => {
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
});
