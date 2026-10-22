/**
 * Server errors to Sentry without the Node SDK (it would weigh on every cold start):
 * one event per 500, sent as a Sentry envelope with fetch. Off unless SENTRY_DSN is set.
 *
 * Nothing personal goes out: no user id or email, no request body, no query string.
 */

const SEND_TIMEOUT_MS = 1500;

export function parseDsn(dsn) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !projectId) return null;
    return {
      publicKey: url.username,
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

/** V8 stack lines into Sentry frames, oldest call first. */
export function stackFrames(stack) {
  return String(stack || "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/))
    .filter(Boolean)
    .map(([, fn, file, line, column]) => ({
      function: fn || "<anonymous>",
      filename: file.replace(/^file:\/\//, "").replace(/^.*?\/(api|lib)\//, "$1/"),
      lineno: Number(line),
      colno: Number(column),
      in_app: !file.includes("node_modules") && !file.startsWith("node:"),
    }))
    .reverse();
}

export function buildEvent(error, { method, path } = {}, now = new Date()) {
  const err = error instanceof Error ? error : new Error(String(error?.message || error));
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    server_name: process.env.VERCEL_REGION || undefined,
    transaction: path ? `${method || "GET"} ${path}` : undefined,
    tags: { side: "api", ...(err.code ? { code: String(err.code) } : {}) },
    request: path ? { method, url: path } : undefined,
    exception: {
      values: [{ type: err.name || "Error", value: err.message, stacktrace: { frames: stackFrames(err.stack) } }],
    },
  };
}

export function buildEnvelope(event, dsn) {
  const header = { event_id: event.event_id, sent_at: new Date().toISOString(), dsn };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}

/** Reports and waits briefly: Vercel may freeze the function once the response is sent. */
export async function reportServerError(error, req) {
  const dsn = process.env.SENTRY_DSN;
  const target = dsn && parseDsn(dsn);
  if (!target) return;

  const path = req?.url ? String(req.url).split("?")[0] : undefined;
  const event = buildEvent(error, { method: req?.method, path });
  try {
    await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=quiz-api/1.0`,
      },
      body: buildEnvelope(event, dsn),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    // monitoring must never turn one error into two
  }
}
