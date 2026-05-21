export function computePoints(isCorrect, timeLimitMs, responseMs) {
  if (!isCorrect) return 0;
  const timeLeft = Math.max(0, timeLimitMs - responseMs);
  return Math.round(1000 * (timeLeft / timeLimitMs));
}
