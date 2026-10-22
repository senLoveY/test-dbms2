import { reportServerError } from "./monitoring.js";

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

export function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

export function unauthorized(res, message = "Unauthorized") {
  sendJson(res, 401, { error: message });
}

export function forbidden(res, message = "Forbidden") {
  sendJson(res, 403, { error: message });
}

export function notFound(res, message = "Not found") {
  sendJson(res, 404, { error: message });
}

/** Logs, reports to Sentry (when SENTRY_DSN is set) before replying, then sends a plain 500. */
export async function serverError(res, error) {
  console.error(error);
  await reportServerError(error, res.req);
  sendJson(res, 500, { error: "Internal server error" });
}
