/** Client helpers for classroom mode: answer letters, join link, results export. */

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function classroomJoinUrl(code) {
  return `${window.location.origin}/play/${code}`;
}

const NICKNAME_KEY = "classroom:nickname";

export function loadNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) || "";
  } catch {
    return "";
  }
}

export function saveNickname(value) {
  try {
    localStorage.setItem(NICKNAME_KEY, value);
  } catch {
    // private mode: the name just isn't remembered
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Semicolon-separated with a BOM, so Excel with a Russian locale opens it as a table. */
export function downloadResultsCsv(title, players, questionTotal) {
  const rows = [
    ["Место", "Имя", "Очки", "Верных ответов", "Вопросов"],
    ...players.map((player, index) => [
      index + 1,
      player.username,
      player.score,
      player.correct_count ?? 0,
      questionTotal,
    ]),
  ];
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(title || "results").replace(/[\\/:*?"<>|]+/g, "").slice(0, 60)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
