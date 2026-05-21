import { getUserFromRequest } from "../../lib/supabaseAdmin.js";
import { joinRoom } from "../../lib/roomService.js";
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

    const { code } = req.body || {};
    if (!code) return badRequest(res, "Room code is required");

    const result = await joinRoom(code, user.id);
    if (result.error) return badRequest(res, result.error);

    return sendJson(res, 200, { room: result.room });
  } catch (error) {
    return serverError(res, error);
  }
}
