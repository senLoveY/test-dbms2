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

export function notFound(res, message = "Not found") {
  sendJson(res, 404, { error: message });
}

export function serverError(res, error) {
  console.error(error);
  sendJson(res, 500, { error: "Internal server error" });
}
