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

const ACTIONS = {
  start: (body, userId) => startGame(body.roomId, userId),
  answer: (body, userId) => submitAnswer(body.roomId, userId, body.selected),
  timeout: (body, userId) => handleTimeout(body.roomId, userId),
  advance: (body, userId) => advanceQuestion(body.roomId, userId, body.index),
  end: (body, userId) => endGameEarly(body.roomId, userId),
};

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const [action] = getApiParts(req, "game");
    const run = ACTIONS[action];
    if (!run) return sendJson(res, 404, { error: "Unknown game action" });

    const body = req.body || {};
    if (!body.roomId) return badRequest(res, "roomId is required");
    if (action === "answer" && !Array.isArray(body.selected)) {
      return badRequest(res, "selected must be an array");
    }

    const result = await run(body, user.id);
    if (result.error) return badRequest(res, result.error);
    return sendJson(res, 200, { state: result.state });
  } catch (error) {
    return serverError(res, error);
  }
}
