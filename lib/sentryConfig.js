/**
 * Sentry project test-dbms2 (org bsuir-aj, EU region). A DSN isn't a secret: it ships in the
 * browser bundle anyway and only allows sending events to this project. VITE_SENTRY_DSN /
 * SENTRY_DSN override it; reporting is on only in production builds and on Vercel.
 */
export const DEFAULT_SENTRY_DSN =
  "https://1a5a9a00238c93b60e07146b4d0f79f0@o4512302218149888.ingest.de.sentry.io/4512302267760720";
