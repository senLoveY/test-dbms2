/**
 * @param {number} scoreRatio 0..1 — доля правильности (1 = полный ответ)
 */
export function computePoints(scoreRatio, timeLimitMs, responseMs) {
  if (!scoreRatio || scoreRatio <= 0) return 0;
  const timeLeft = Math.max(0, timeLimitMs - responseMs);
  return Math.round(1000 * scoreRatio * (timeLeft / timeLimitMs));
}
