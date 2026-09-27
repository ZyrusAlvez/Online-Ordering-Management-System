#!/usr/bin/env node
// Boots an API server on a test port, waits for it, runs `node --test`, then
// tears the server down and exits with the runner's status.
//
// Node's test runner gives each test FILE its own process, so a server started
// inside a test module would not be shared. Starting it here once, outside the
// runner, is what lets every file talk to the same instance.
//
// Set TEST_BASE_URL to point the suite at an already-running server instead.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';

// `npm test` runs this file without --env-file, so load .env here. Variables
// already set in the shell take precedence, which is what lets CI inject its
// own values; .env is optional so CI can run without one at all.
if (existsSync('.env')) process.loadEnvFile('.env');

const PORT = process.env.TEST_PORT ?? '4100';
const BASE = process.env.TEST_BASE_URL ?? `http://localhost:${PORT}/api/v1`;
const external = Boolean(process.env.TEST_BASE_URL);

// Deterministic secret so webhook signatures can be produced by the tests.
const WEBHOOK_SECRET = 'whsk_testsecret123';

const waitForHealth = async (timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

let server;

if (!external) {
  server = spawn(process.execPath, ['--env-file=.env', 'src/server.js'], {
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'test',
      LOG_FORMAT: 'tiny',
      PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
      // Keep the limiter out of the way: the suite makes many rapid calls.
      RATE_LIMIT_MAX: '100000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = [];
  server.stdout.on('data', (d) => log.push(d.toString()));
  server.stderr.on('data', (d) => log.push(d.toString()));

  server.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error('Server exited early:\n' + log.join(''));
    }
  });

  if (!(await waitForHealth())) {
    console.error('Server never became healthy:\n' + log.join(''));
    server.kill('SIGKILL');
    process.exit(1);
  }
}

// Fail fast and legibly. Without this, a missing or stale test password shows
// up as every test in the file being "cancelledByParent" — hundreds of lines
// that never name the real problem.
const preflight = async () => {
  const accounts = [
    ['admin', process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD, 'admin@3k.local'],
    ['cashier', process.env.TEST_CASHIER_PASSWORD ?? process.env.CASHIER_PASSWORD, 'cashier@3k.local'],
    ['customer', process.env.TEST_CUSTOMER_PASSWORD ?? 'testpass12345', 'customer@3k.local'],
    ['customer2', 'testpass12345', 'customer2@3k.local'],
    ['rider', process.env.TEST_RIDER_PASSWORD ?? 'testpass12345', 'rider1@3k.local'],
  ];

  const missing = accounts.filter(([, password]) => !password).map(([role]) => role);
  if (missing.length) {
    return {
      ok: false,
      message:
        `No password set for: ${missing.join(', ')}.\n\n` +
        `Seed the accounts, which writes the passwords into .env for you:\n` +
        `  node --env-file=.env scripts/seed-accounts.mjs\n` +
        `  node --env-file=.env scripts/dev/seed-test-users.mjs`,
    };
  }

  const failed = [];
  for (const [role, password, email] of accounts) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);

    if (!res || res.status !== 200) failed.push(`${role} (${email}): ${res?.status ?? 'unreachable'}`);
  }

  if (failed.length) {
    return {
      ok: false,
      message:
        `These test accounts could not sign in:\n  ${failed.join('\n  ')}\n\n` +
        `Either the account does not exist yet, or the password in .env is stale.\n` +
        `Re-seed to fix both:\n` +
        `  node --env-file=.env scripts/seed-accounts.mjs\n` +
        `  node --env-file=.env scripts/dev/seed-test-users.mjs`,
    };
  }

  return { ok: true };
};

const check = await preflight();
if (!check.ok) {
  console.error(`\nCannot run the test suite.\n\n${check.message}\n`);
  if (server) server.kill('SIGTERM');
  process.exit(1);
}

const args = ['--env-file=.env', '--test'];
// Shared database state means files must not run against each other.
args.push('--test-concurrency=1');
if (process.argv.includes('--coverage')) args.push('--experimental-test-coverage');

// A bare directory is resolved as a module path by this Node version, so the
// test files are selected with an explicit glob instead.
const only = process.argv.find((a) => a.startsWith('--dir='));
const dir = only ? only.slice('--dir='.length).replace(/\/$/, '') : 'tests';
args.push(`${dir}/**/*.test.js`);

const runner = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    TEST_BASE_URL: BASE,
    TEST_WEBHOOK_SECRET: WEBHOOK_SECRET,
    // Unit tests import payment.service.js directly and verify signatures
    // in-process, so the runner needs the same secret the server has.
    PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  },
});

const [code] = await once(runner, 'exit');

if (server) server.kill('SIGTERM');
process.exit(code ?? 1);
