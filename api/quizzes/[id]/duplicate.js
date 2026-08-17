import { getUserFromRequest } from "../../../../lib/supabaseAdmin.js";
import { duplicateQuiz } from "../../../../lib/quizService.js";
import {
  forbidden,
  methodNotAllowed,
  notFound,
  sendJson,
  serverError,
  unauthorized,
} from "../../../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const quizId = req.query.id;
    const result = await duplicateQuiz(quizId, user.id);
    if (result.error === "Quiz not found") return notFound(res, result.error);
    if (result.error === "Forbidden") return forbidden(res, "Это не ваш тест");
    if (result.error) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 201, result);
  } catch (error) {
    return serverError(res, error);
  }
}
