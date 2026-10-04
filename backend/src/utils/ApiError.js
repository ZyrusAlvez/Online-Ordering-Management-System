export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized', details) {
    return new ApiError(401, message, details);
  }

  static forbidden(message = 'Forbidden', details) {
    return new ApiError(403, message, details);
  }

  static notFound(message = 'Not found', details) {
    return new ApiError(404, message, details);
  }

  static conflict(message = 'Conflict', details) {
    return new ApiError(409, message, details);
  }

  static internal(message = 'Internal server error', details) {
    return new ApiError(500, message, details);
  }
}

/** Maps a PostgREST error onto an ApiError with a sensible status code. */
export const fromPostgrestError = (error, fallbackMessage = 'Database error') => {
  const status =
    {
      PGRST116: 404, // no rows returned for .single()
      '23505': 409, // unique violation
      '23503': 409, // foreign key violation
      '42501': 403, // insufficient privilege / RLS
      PGRST103: 400, // requested page is past the end of the results
    }[error.code] ?? 500;

  return new ApiError(status, error.message || fallbackMessage, { code: error.code });
};
