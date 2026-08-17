import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import {
  createRoom,
  getRoomState,
  joinRoom,
  leaveRoom,
  updateRoomSettings,
} from "../lib/roomService.js";
import { getApiParts } from "../lib/apiPath.js";
import {
  badRequest,
  methodNotAllowed,
  sendJson,
  serverError,
  unauthorized,
} from "../lib/http.js";

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const [action] = getApiParts(req, "rooms");
    if (!action) return notFoundAction(res);

    if (action === "state") {
      if (req.method !== "GET") return methodNotAllowed(res);
      const roomId = req.query.roomId;
      if (!roomId) return badRequest(res, "roomId is required");

      const state = await getRoomState(roomId);
      const isMember = state.players.some((p) => p.user_id === user.id);
      if (!isMember) return unauthorized(res, "Not a room member");
      return sendJson(res, 200, state);
    }

    if (req.method !== "POST") return methodNotAllowed(res);

    if (action === "create") {
      const { settings, quizId } = req.body || {};
      const result = await createRoom(user.id, settings, quizId);
      if (result.error) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, { room: result.room });
    }

    if (action === "join") {
      const { code } = req.body || {};
      if (!code) return badRequest(res, "Room code is required");
      const result = await joinRoom(code, user.id);
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, { room: result.room });
    }

    if (action === "leave") {
      const { roomId } = req.body || {};
      if (!roomId) return badRequest(res, "roomId is required");
      const result = await leaveRoom(roomId, user.id);
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, result);
    }

    if (action === "settings") {
      const { roomId, settings } = req.body || {};
      if (!roomId) return badRequest(res, "roomId is required");
      const result = await updateRoomSettings(roomId, user.id, settings || {});
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, result);
    }

    return notFoundAction(res);
  } catch (error) {
    return serverError(res, error);
  }
}

function notFoundAction(res) {
  return sendJson(res, 404, { error: "Unknown rooms action" });
}
