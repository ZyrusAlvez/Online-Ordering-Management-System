import type { Result } from '@/utils/result';

/** What screens catch: the same shape the old API client threw (status, message, friendly). */
export class ApiError extends Error {
  status: number;
  details?: Record<string, string[]>;

  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.details = details;
  }

  /** First field message if any, else the message. */
  get friendly() {
    const fields = this.details && Object.values(this.details).flat().filter(Boolean);
    return fields?.[0] ?? this.message;
  }
}

/** Unwraps a controller Result: returns its data, or throws an ApiError the screens already handle. */
export async function call<T>(pending: Promise<Result<T>> | Result<T>): Promise<T> {
  let result: Result<T>;
  try {
    result = await pending;
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (result.success === false) throw new ApiError(result.status ?? 400, result.error);
  return result.data;
}

/** The old API's `{ data }` envelope around a controller's result, so screens read `res.data` as before. */
export async function respond<T>(pending: Promise<Result<T>> | Result<T>): Promise<{ data: T }> {
  return { data: await call(pending) };
}
