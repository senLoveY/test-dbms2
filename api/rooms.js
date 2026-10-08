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
  notFound,
  sendJson,
  serverError,
  unauthorized,
} from "../lib/http.js";

function sendState(res, result) {
  if (result.error) return badRequest(res, result.error);
  return sendJson(res, 200, { room: result.state.room, state: result.state });
}

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const [action] = getApiParts(req, "rooms");
    if (!action) return notFound(res, "Unknown rooms action");

    if (action === "state") {
      if (req.method !== "GET") return methodNotAllowed(res);
      const { roomId, code } = req.query;
      if (!roomId && !code) return badRequest(res, "roomId or code is required");

      const result = await getRoomState({ roomId, code }, user.id);
      if (result.error) return notFound(res, result.error);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, result.state);
    }

    if (req.method !== "POST") return methodNotAllowed(res);
    const body = req.body || {};

    if (action === "create") {
      return sendState(res, await createRoom(user.id, body.settings, body.quizId));
    }

    if (action === "join") {
      if (!body.code) return badRequest(res, "Введите код комнаты");
      return sendState(res, await joinRoom(body.code, user.id));
    }

    if (!body.roomId) return badRequest(res, "roomId is required");

    if (action === "leave") {
      return sendJson(res, 200, await leaveRoom(body.roomId, user.id));
    }

    if (action === "settings") {
      return sendState(res, await updateRoomSettings(body.roomId, user.id, body.settings || {}));
    }

    return notFound(res, "Unknown rooms action");
  } catch (error) {
    return serverError(res, error);
  }
}
