import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import {
  advanceQuestion,
  endGameEarly,
  handleTimeout,
  startGame,
  submitAnswer,
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
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const [action] = getApiParts(req, "game");
    const { roomId, selected } = req.body || {};
    if (!roomId) return badRequest(res, "roomId is required");

    if (action === "start") {
      const result = await startGame(roomId, user.id);
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, result);
    }

    if (action === "answer") {
      if (!Array.isArray(selected)) return badRequest(res, "selected must be an array");
      const result = await submitAnswer(roomId, user.id, selected);
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, result);
    }

    if (action === "timeout") {
      const result = await handleTimeout(roomId);
      return sendJson(res, 200, result);
    }

    if (action === "advance") {
      const result = await advanceQuestion(roomId, user.id);
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, result);
    }

    if (action === "end") {
      const result = await endGameEarly(roomId, user.id);
      if (result.error) return badRequest(res, result.error);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { error: "Unknown game action" });
  } catch (error) {
    return serverError(res, error);
  }
}
