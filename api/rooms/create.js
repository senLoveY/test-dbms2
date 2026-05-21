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

    const room = await createRoom(user.id);
    return sendJson(res, 200, { room });
  } catch (error) {
    return serverError(res, error);
  }
}
