/**
 * Extra time to read a long question. The base timer is for thinking; a question
 * whose text and options run past a short paragraph gets a second per few words more.
 *
 * Mirrored in SQL (public.question_reading_bonus in reading-time-migration.sql),
 * which sets room deadlines: keep the numbers in sync (tests/readingTime.test.js checks).
 */
export const READING_TIME = {
  freeChars: 150,
  charsPerSecond: 15,
  maxBonusSec: 30,
};

export function questionLength(question) {
  if (!question) return 0;
  const options = Array.isArray(question.options) ? question.options : [];
  return String(question.text || "").length + options.reduce((sum, option) => sum + String(option || "").length, 0);
}

export function readingBonusSec(question) {
  const extra = Math.max(0, questionLength(question) - READING_TIME.freeChars);
  return Math.min(READING_TIME.maxBonusSec, Math.ceil(extra / READING_TIME.charsPerSecond));
}

export function totalReadingSec(questions) {
  return (questions || []).reduce((sum, question) => sum + readingBonusSec(question), 0);
}
