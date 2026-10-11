const API_CACHE = "api-quizzes";

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

/** Quizzes cached for offline study belong to the signed-in user. */
export function clearOfflineQuizzes() {
  if ("caches" in window) caches.delete(API_CACHE).catch(() => {});
}
