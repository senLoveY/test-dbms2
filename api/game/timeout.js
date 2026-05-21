import { getUserFromRequest } from "../../lib/supabaseAdmin.js";
import { handleTimeout } from "../../lib/roomService.js";
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

    const { roomId } = req.body || {};
    if (!roomId) return badRequest(res, "roomId is required");

    const result = await handleTimeout(roomId);
    return sendJson(res, 200, result);
  } catch (error) {
    return serverError(res, error);
  }
}
