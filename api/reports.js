import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import { deleteClassReport, getClassReport, listClassReports } from "../lib/classReportService.js";
import { getApiParts } from "../lib/apiPath.js";
import { methodNotAllowed, notFound, sendJson, serverError, unauthorized } from "../lib/http.js";

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);
    if (user.isAnonymous) return unauthorized(res, "Нужен аккаунт");

    const [id] = getApiParts(req, "reports");

    if (!id) {
      if (req.method !== "GET") return methodNotAllowed(res);
      return sendJson(res, 200, await listClassReports(user.id));
    }

    if (req.method === "GET") {
      const result = await getClassReport(id, user.id);
      if (result.error) return notFound(res, result.error);
      return sendJson(res, 200, result);
    }
    if (req.method === "DELETE") {
      const result = await deleteClassReport(id, user.id);
      if (result.error) return notFound(res, result.error);
      return sendJson(res, 200, result);
    }
    return methodNotAllowed(res);
  } catch (error) {
    return serverError(res, error);
  }
}
