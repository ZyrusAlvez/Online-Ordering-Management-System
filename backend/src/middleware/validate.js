import { ApiError } from '../utils/ApiError.js';

/**
 * Validates and replaces req.body / req.query / req.params from zod schemas.
 * Usage: router.post('/', validate({ body: createOrderSchema }), handler)
 *
 * Parsed output replaces the raw input, so controllers receive coerced,
 * defaulted values and never re-parse strings themselves.
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['body', 'query', 'params']) {
    const schema = schemas[key];
    if (!schema) continue;

    const result = schema.safeParse(req[key]);
    if (!result.success) {
      const { fieldErrors, formErrors } = result.error.flatten();
      return next(
        ApiError.badRequest(`Invalid request ${key}`, {
          ...fieldErrors,
          // Schema-level .refine() failures carry no field path, so without
          // this they would surface as an empty details object.
          ...(formErrors.length ? { _errors: formErrors } : {}),
        }),
      );
    }

    req[key] = result.data;
  }

  next();
};
