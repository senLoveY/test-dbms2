/** Exam mode: one timer for the whole test, no hints, a school grade at the end. */

export const EXAM_SECONDS_PER_QUESTION = 45;
const MIN_SECONDS = 5 * 60;
const MAX_SECONDS = 60 * 60;

/**
 * Whole minutes, so the timer reads as a normal exam: 45 s per question plus reading time
 * for long ones (lib/readingTime.js), 5–60 min.
 */
export function examDurationSec(questionCount, readingSec = 0) {
  const raw = Math.max(1, questionCount) * EXAM_SECONDS_PER_QUESTION + Math.max(0, readingSec);
  const clamped = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, raw));
  return Math.ceil(clamped / 60) * 60;
}

const GRADES = [
  { min: 90, grade: 5, label: "отлично" },
  { min: 75, grade: 4, label: "хорошо" },
  { min: 50, grade: 3, label: "удовлетворительно" },
  { min: 0, grade: 2, label: "неудовлетворительно" },
];

export function examGrade(correct, total) {
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const { grade, label } = GRADES.find((item) => percent >= item.min);
  return { grade, label, percent };
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
