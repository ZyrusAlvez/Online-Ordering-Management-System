import { createApp } from './app.js';
import { env } from './config/env.js';

// An unset NODE_ENV means "development", which shows stack traces to clients and
// allows any browser origin. Say so loudly rather than let it go to production by accident.
if (!process.env.NODE_ENV) {
  console.warn('[config] NODE_ENV is not set, so the API runs in development mode (stack traces in errors).');
}
if (env.CORS_ORIGIN === '*' && env.isProduction) {
  console.warn('[config] CORS_ORIGIN is "*" in production; set it to your site\'s address.');
}

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}${env.API_PREFIX} [${env.NODE_ENV}]`);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
