export function shuffleArray(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Per-option result for review: "right-selected" | "right-missed" | "wrong-selected" | "neutral" */
export function getAnswerStates(question, selected) {
  const selectedSet = new Set(selected);
  return question.options.map((_, index) => {
    const isSelected = selectedSet.has(index);
    const isCorrect = question.correct.includes(index);
    if (isCorrect && isSelected) return "right-selected";
    if (isCorrect) return "right-missed";
    if (isSelected) return "wrong-selected";
    return "neutral";
  });
}
