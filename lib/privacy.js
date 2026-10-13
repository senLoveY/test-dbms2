/**
 * Personal data rules shared by the API and the app (Law of Belarus No. 99-З).
 * Bump CONSENT_VERSION whenever the consent text changes: everyone is asked again.
 */
export const CONSENT_VERSION = "2026-10-13";

/** How long data that isn't tied to the account's lifetime is kept. */
export const RETENTION = {
  roomDays: 30,
  generationLogHours: 24,
};

export const USERNAME_MAX = 32;

/** True when the user still has to (re)accept. No consent column at all means the migration isn't applied yet. */
export function needsConsent(profile) {
  if (!profile || !("consent_version" in profile)) return false;
  return profile.consent_version !== CONSENT_VERSION;
}

export function normalizeUsername(value) {
  const username = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!username) return { error: "Введите никнейм" };
  if (username.length > USERNAME_MAX) return { error: `Никнейм — до ${USERNAME_MAX} символов` };
  if (/@/.test(username)) return { error: "Никнейм не должен содержать email" };
  return { username };
}

export function daysAgo(days, now = Date.now()) {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}
