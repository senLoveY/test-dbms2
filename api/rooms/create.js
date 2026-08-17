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

    const { settings, quizId } = req.body || {};
    const result = await createRoom(user.id, settings, quizId);
    if (result.error) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 200, { room: result.room });
  } catch (error) {
    return serverError(res, error);
  }
}
