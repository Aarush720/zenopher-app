/** Errors carry a stable code and a safe message. Nothing internal is ever returned (spec 8.6). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}
export const notFound = () => new ApiError(404, "not_found", "Not found.");
export const unauthorized = () => new ApiError(401, "unauthorized", "Please sign in.");
export const badRequest = (code: string, message: string) => new ApiError(400, code, message);
export const tooMany = (retryAfter: number) => new ApiError(429, "rate_limited", "Too many requests. Try again later.", { retry_after: retryAfter });
