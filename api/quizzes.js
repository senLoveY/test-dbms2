import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import {
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  getQuiz,
  listAttempts,
  listQuizzes,
  saveAttempt,
  updateQuiz,
} from "../lib/quizService.js";
import { generateQuizFromText } from "../lib/quizGenerate.js";
import { getApiParts } from "../lib/apiPath.js";
import {
  forbidden,
  methodNotAllowed,
  notFound,
  sendJson,
  serverError,
  unauthorized,
} from "../lib/http.js";

export const config = {
  maxDuration: 60,
};

function mapServiceError(res, error) {
  if (error === "Quiz not found") return notFound(res, error);
  if (error === "Forbidden") return forbidden(res, "Это не ваш тест");
  return sendJson(res, 400, { error });
}

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const [quizId, extra] = getApiParts(req, "quizzes");

    if (!quizId) {
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
    }

    if (extra === "generate") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const owned = await getQuiz(quizId, user.id);
      if (owned.error) return mapServiceError(res, owned.error);

      const { source, count, allowMultiple } = req.body || {};
      const result = await generateQuizFromText({ source, count, allowMultiple });
      if (result.error) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, result);
    }

    if (extra === "duplicate") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const result = await duplicateQuiz(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 201, result);
    }

    if (extra === "attempt") {
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
    }

    if (extra) return notFound(res, "Unknown quizzes action");

    if (req.method === "GET") {
      const result = await getQuiz(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 200, result);
    }

    if (req.method === "PUT") {
      const result = await updateQuiz(quizId, user.id, req.body || {});
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 200, result);
    }

    if (req.method === "DELETE") {
      const result = await deleteQuiz(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 200, result);
    }

    return methodNotAllowed(res);
  } catch (error) {
    return serverError(res, error);
  }
}
