import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import {
  claimGenerationQuota,
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  getProgress,
  getQuiz,
  getQuizAccess,
  getQuizMeta,
  listAttempts,
  listQuizzes,
  saveAttempt,
  updateQuiz,
} from "../lib/quizService.js";
import { checkGenerationSource, checkGenerationTopic, generateQuizFromText } from "../lib/quizGenerate.js";
import { getApiParts } from "../lib/apiPath.js";
import { fetchArticle } from "../lib/articleSource.js";
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
  if (error === "Not shared") return forbidden(res, "Автор закрыл доступ к этому тесту");
  return sendJson(res, 400, { error });
}

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);
    if (user.isAnonymous) return unauthorized(res, "Нужен аккаунт");

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
      const { source, topic, count, allowMultiple } = req.body || {};
      // Check ownership and quota before the paid model call, not alongside it.
      const owned = await getQuizMeta(quizId, user.id);
      if (owned.error) return mapServiceError(res, owned.error);
      const sourceError = topic ? checkGenerationTopic(topic) : checkGenerationSource(source);
      if (sourceError) return sendJson(res, 400, { error: sourceError });
      const quota = await claimGenerationQuota(user.id);
      if (quota.error) return sendJson(res, 429, { error: quota.error });
      const result = await generateQuizFromText({ source, topic, count, allowMultiple });
      if (result.error) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, result);
    }

    // Article text from a link, shown in the generator before anything is sent to the model
    if (extra === "source") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const owned = await getQuizMeta(quizId, user.id);
      if (owned.error) return mapServiceError(res, owned.error);
      const result = await fetchArticle(req.body?.url);
      if (result.error) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, result);
    }

    if (extra === "duplicate") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const result = await duplicateQuiz(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 201, result);
    }

    if (extra === "info") {
      if (req.method !== "GET") return methodNotAllowed(res);
      const result = await getQuizAccess(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      return sendJson(res, 200, result);
    }

    if (extra === "progress") {
      if (req.method !== "GET") return methodNotAllowed(res);
      const result = await getProgress(quizId, user.id);
      if (result.error) return mapServiceError(res, result.error);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, result);
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
