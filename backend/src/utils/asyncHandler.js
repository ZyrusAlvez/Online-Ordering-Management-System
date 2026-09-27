/**
 * Wraps an async route handler so rejected promises reach the error middleware
 * instead of crashing the process. (Express 4 does not await handlers.)
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
