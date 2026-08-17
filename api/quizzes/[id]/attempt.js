import { getUserFromRequest } from "../../../../lib/supabaseAdmin.js";
import { listAttempts, saveAttempt } from "../../../../lib/quizService.js";
import {
  forbidden,
  methodNotAllowed,
  notFound,
  sendJson,
  serverError,
  unauthorized,
} from "../../../../lib/http.js";

function mapServiceError(res, error) {
  if (error === "Quiz not found") return notFound(res, error);
  if (error === "Forbidden") return forbidden(res, "Это не ваш тест");
  return sendJson(res, 400, { error });
}

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const quizId = req.query.id;

    if (req.method === "GET") {
      const result = await listAttempts(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST") {
      const result = await saveAttempt(quizId, user.id, req.body || {});
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 201, result);
    }

    return methodNotAllowed(res);
  } catch (error) {
    return serverError(res, error);
  }
}
