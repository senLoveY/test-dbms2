import { getUserFromRequest } from "../../lib/supabaseAdmin.js";
import { submitAnswer } from "../../lib/roomService.js";
import {
  badRequest,
  methodNotAllowed,
  sendJson,
  serverError,
  unauthorized,
} from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const { roomId, selected } = req.body || {};
    if (!roomId) return badRequest(res, "roomId is required");
    if (!Array.isArray(selected)) return badRequest(res, "selected must be an array");

    const result = await submitAnswer(roomId, user.id, selected);
    if (result.error) return badRequest(res, result.error);

    return sendJson(res, 200, result);
  } catch (error) {
    return serverError(res, error);
  }
}
