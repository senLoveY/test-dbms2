import { getUserFromRequest } from "../lib/supabaseAdmin.js";
import { deleteAccount, exportAccount, updateUsername } from "../lib/accountService.js";
import { getApiParts } from "../lib/apiPath.js";
import { badRequest, methodNotAllowed, notFound, sendJson, serverError, unauthorized } from "../lib/http.js";

function send(res, result) {
  if (result.error) return badRequest(res, result.error);
  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 200, result);
}

export default async function handler(req, res) {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError) return unauthorized(res, authError);

    const [action] = getApiParts(req, "account");
    const body = req.body || {};

    if (!action) {
      if (req.method === "PATCH") return send(res, await updateUsername(user.id, body.username));
      if (req.method === "DELETE") {
        if (body.confirm !== true) return badRequest(res, "Подтвердите удаление аккаунта");
        return send(res, await deleteAccount(user.id));
      }
      return methodNotAllowed(res);
    }

    if (action === "export") {
      if (req.method !== "GET") return methodNotAllowed(res);
      return send(res, { data: await exportAccount(user) });
    }

    return notFound(res, "Unknown account action");
  } catch (error) {
    return serverError(res, error);
  }
}
