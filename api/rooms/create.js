import { getUserFromRequest } from "../../lib/supabaseAdmin.js";
import { createRoom } from "../../lib/roomService.js";
import {
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

    const { settings } = req.body || {};
    const room = await createRoom(user.id, settings);
    return sendJson(res, 200, { room });
  } catch (error) {
    return serverError(res, error);
  }
}
