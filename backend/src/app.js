import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import webhookRoutes from './routes/webhooks.routes.js';

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(morgan(env.LOG_FORMAT, { skip: () => env.NODE_ENV === 'test' }));

  // Webhooks mount before the JSON parser and before the rate limiter:
  //   - signature verification needs the exact raw bytes, which express.json()
  //     would consume and re-serialise differently;
  //   - PayMongo's delivery/retry rate is not something to throttle.
  app.use(
    `${env.API_PREFIX}/webhooks`,
    express.raw({ type: 'application/json', limit: '1mb' }),
    webhookRoutes,
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      // A kiosk polls its payment status every 2 seconds; a restaurant's whole
      // LAN shares one IP, so that polling must not eat everyone's budget.
      skip: (req) => req.method === 'GET' && /\/kiosk\/orders\//.test(req.originalUrl),
    }),
  );

  app.use(env.API_PREFIX, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
