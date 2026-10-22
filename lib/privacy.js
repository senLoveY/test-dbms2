/** Personal data rules shared by the API and the app. */

/** How long data that isn't tied to the account's lifetime is kept. */
export const RETENTION = {
  roomDays: 30,
  /** classroom rooms keep the names of everyone who joined */
  classroomDays: 1,
  /** anonymous accounts made for joining a class */
  guestHours: 24,
  generationLogHours: 24,
};

export const USERNAME_MAX = 32;

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
