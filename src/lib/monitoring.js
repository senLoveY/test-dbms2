/**
 * Browser errors to Sentry. The SDK loads after the page is up (it isn't needed to render),
 * errors from before that are queued. On in production builds (lib/sentryConfig.js), off in dev.
 *
 * Nothing personal goes out: no user, no IP-based data, no query strings, no form contents.
 */

import { DEFAULT_SENTRY_DSN } from "../../lib/sentryConfig.js";

// production builds report to the project by default; dev servers only with an explicit DSN
const DSN = import.meta.env.VITE_SENTRY_DSN || (import.meta.env.PROD ? DEFAULT_SENTRY_DSN : "");
const MAX_QUEUE = 20;

let sentry = null;
const queue = [];

// noise from browsers and extensions, not from the app
const IGNORE = [/ResizeObserver loop/, /AbortError/, /Load failed/, /Failed to fetch dynamically imported module/];

function stripQuery(url) {
  return typeof url === "string" ? url.split("?")[0].split("#")[0] : url;
}

function scrub(event) {
  delete event.user;
  if (event.request) {
    event.request = { url: stripQuery(event.request.url) };
  }
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.data?.url) crumb.data.url = stripQuery(crumb.data.url);
    if (crumb.data?.to) crumb.data.to = stripQuery(crumb.data.to);
    if (crumb.data?.from) crumb.data.from = stripQuery(crumb.data.from);
  }
  return event;
}

function enqueue(error, context) {
  if (queue.length < MAX_QUEUE) queue.push({ error, context });
}

export function reportError(error, context) {
  if (!DSN) return;
  if (sentry) sentry.captureException(error, context ? { extra: context } : undefined);
  else enqueue(error, context);
}

export function initMonitoring() {
  if (!DSN || typeof window === "undefined") return;

  const early = (event) => enqueue(event.error || event.reason || event.message);
  window.addEventListener("error", early);
  window.addEventListener("unhandledrejection", early);

  const start = () =>
    import("@sentry/browser")
      .then((Sentry) => {
        Sentry.init({
          dsn: DSN,
          release: __RELEASE__,
          environment: import.meta.env.MODE,
          sendDefaultPii: false,
          tracesSampleRate: 0,
          ignoreErrors: IGNORE,
          // only errors leave the browser: no per-visit session pings
          integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserSession"),
          beforeSend: scrub,
        });
        sentry = Sentry;
        window.removeEventListener("error", early);
        window.removeEventListener("unhandledrejection", early);
        for (const { error, context } of queue.splice(0)) reportError(error, context);
      })
      .catch(() => {});

  // after the first paint: monitoring shouldn't cost the page anything
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1500);
}
