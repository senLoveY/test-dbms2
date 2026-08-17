import { getUserFromRequest } from "../../lib/supabaseAdmin.js";
import { createQuiz, listQuizzes } from "../../lib/quizService.js";
import {
  methodNotAllowed,
  sendJson,
  serverError,
  unauthorized,
} from "../../lib/http.js";

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    if (req.method === "GET") {
      const quizzes = await listQuizzes(user.id);
      return sendJson(res, 200, { quizzes });
    }

    if (req.method === "POST") {
      const result = await createQuiz(user.id, req.body || {});
      if (result.error) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 201, result);
    }

    return methodNotAllowed(res);
  } catch (error) {
    return serverError(res, error);
  }
}
