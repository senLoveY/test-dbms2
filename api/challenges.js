import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import {
  createChallenge,
  getChallenge,
  startChallenge,
  submitChallenge,
} from "../lib/challengeService.js";
import { getApiParts } from "../lib/apiPath.js";
import { badRequest, methodNotAllowed, notFound, sendJson, serverError, unauthorized } from "../lib/http.js";

function send(res, result, status = 200) {
  if (result.error) return badRequest(res, result.error);
  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, status, result);
}

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);
    if (user.isAnonymous) return unauthorized(res, "Нужен аккаунт");

    const [id, action] = getApiParts(req, "challenges");
    const body = req.body || {};

    if (!id) {
      if (req.method !== "POST") return methodNotAllowed(res);
      return send(res, await createChallenge(user.id, body), 201);
    }

    if (!action) {
      if (req.method !== "GET") return methodNotAllowed(res);
      const result = await getChallenge(id, user.id);
      if (result.error) return notFound(res, result.error);
      return send(res, result);
    }

    if (req.method !== "POST") return methodNotAllowed(res);
    if (action === "start") return send(res, await startChallenge(id, user.id));
    if (action === "submit") return send(res, await submitChallenge(id, user.id, body.answers));
    return notFound(res, "Unknown challenges action");
  } catch (error) {
    return serverError(res, error);
  }
}
