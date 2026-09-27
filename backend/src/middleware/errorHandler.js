import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export const errorHandler = (err, req, res, next) => {
  const status = err instanceof ApiError ? err.status : err.status ?? 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json({
    error: {
      message: status >= 500 && env.isProduction ? 'Internal server error' : err.message,
      ...(err.details ? { details: err.details } : {}),
      ...(env.isProduction ? {} : { stack: err.stack }),
    },
  });
};
