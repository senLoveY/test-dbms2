import { toExportPayload } from "../../lib/quizModel.js";

function fileNameFor(title) {
  const base = String(title || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "quiz"}.json`;
}

export function downloadQuizJson(quiz) {
  const json = JSON.stringify(toExportPayload(quiz), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameFor(quiz.title);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
