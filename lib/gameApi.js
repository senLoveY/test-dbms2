import {
  advanceQuestion,
  endGameEarly,
  handleTimeout,
  startGame,
  submitAnswer,
} from "./roomService.js";
import { getApiParts } from "./apiPath.js";
import { badRequest, methodNotAllowed, sendJson } from "./http.js";

/**
 * Game actions (/api/game/*). They are served by the rooms function: joining a room
 * then warms the same instance that takes the first answers, instead of a class's
 * first answers all hitting a cold function of their own.
 */
const ACTIONS = {
  start: (body, userId) => startGame(body.roomId, userId),
  answer: (body, userId) => submitAnswer(body.roomId, userId, body.selected, body.index),
  timeout: (body, userId) => handleTimeout(body.roomId, userId),
  advance: (body, userId) => advanceQuestion(body.roomId, userId, body.index),
  end: (body, userId) => endGameEarly(body.roomId, userId),
};

function paths(req) {
  return [req.headers["x-invoke-path"], req.headers["x-matched-path"], req.headers["x-real-url"], req.url]
    .filter(Boolean)
    .map(String);
}

export function isGameRequest(req) {
  return req.query?.group === "game" || paths(req).some((path) => path.includes("/api/game/"));
}

export async function handleGame(req, res, user) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const [fromPath] = getApiParts(req, "game");
  const action = ACTIONS[fromPath] ? fromPath : req.query?.action;
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
}
