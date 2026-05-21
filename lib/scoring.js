/** Минимальная доля очков за время при ответе в конце таймера (щадящий коэффициент) */
export const MIN_TIME_FACTOR = 0.6;

/**
 * @param {number} scoreRatio 0..1 — доля правильности (1 = полный ответ)
 */
export function computePoints(scoreRatio, timeLimitMs, responseMs) {
  if (!scoreRatio || scoreRatio <= 0) return 0;
  const timeLeft = Math.max(0, timeLimitMs - responseMs);
  const linearRatio = timeLeft / timeLimitMs;
  const timeFactor = MIN_TIME_FACTOR + (1 - MIN_TIME_FACTOR) * linearRatio;
  return Math.round(1000 * scoreRatio * timeFactor);
}
