import { useEffect, useState } from "react";

/**
 * Theme preference: "system" follows the OS, "light"/"dark" are explicit.
 * index.html applies the resolved theme before first paint; this module keeps it in sync.
 */
const STORAGE_KEY = "theme";
const THEME_COLORS = { light: "#f4f0e6", dark: "#141310" };
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set();

function readPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

let preference = readPreference();

function apply() {
  const resolved = preference === "system" ? (darkQuery.matches ? "dark" : "light") : preference;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  });
}

darkQuery.addEventListener("change", () => {
  if (preference === "system") apply();
});

export function setThemePreference(next) {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode: keep the choice for this session only */
  }
  apply();
  listeners.forEach((listener) => listener(next));
}

export function useThemePreference() {
  const [value, setValue] = useState(preference);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return [value, setThemePreference];
}

apply();
