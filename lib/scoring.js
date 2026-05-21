/** Минимальная доля очков за время при ответе в конце таймера (щадящий коэффициент) */
export const MIN_TIME_FACTOR = 0.6;

/**
 * @param {number} scoreRatio 0..1 — доля правильности (1 = полный ответ)
 */
export function computePoints(scoreRatio, timeLimitMs, responseMs, options = {}) {
  if (!scoreRatio || scoreRatio <= 0) return 0;
  const minFactor = options.minTimeFactor ?? MIN_TIME_FACTOR;
  const maxPoints = options.maxPoints ?? 1000;
  const timeLeft = Math.max(0, timeLimitMs - responseMs);
  const linearRatio = timeLeft / timeLimitMs;
  const timeFactor = minFactor + (1 - minFactor) * linearRatio;
  return Math.round(maxPoints * scoreRatio * timeFactor);
}
