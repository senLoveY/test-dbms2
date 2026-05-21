import { getUserFromRequest } from "../../lib/supabaseAdmin.js";
import { getRoomState } from "../../lib/roomService.js";
import {
  badRequest,
  methodNotAllowed,
  notFound,
  sendJson,
  serverError,
  unauthorized,
} from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const roomId = req.query.roomId;
    if (!roomId) return badRequest(res, "roomId is required");

    const state = await getRoomState(roomId);
    const isMember = state.players.some((p) => p.user_id === user.id);
    if (!isMember) return unauthorized(res, "Not a room member");

    return sendJson(res, 200, state);
  } catch (error) {
    return serverError(res, error);
  }
}
