import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiRequest } from "./api.js";

/**
 * Small stale-while-revalidate cache for quizzes, shared by every page,
 * so moving between home, the cabinet and the duel setup is instant.
 */

let list = null;
let listError = "";
let listRequest = null;
const details = new Map();
const detailErrors = new Map();
const listeners = new Set();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return version;
}

export function reloadQuizzes() {
  if (listRequest) return listRequest;
  listRequest = apiRequest("/api/quizzes")
    .then((data) => {
      list = data.quizzes || [];
      listError = "";
    })
    .catch((error) => {
      listError = error.message;
    })
    .finally(() => {
      listRequest = null;
      emit();
    });
  return listRequest;
}

export function useQuizzes(enabled = true) {
  useSyncExternalStore(subscribe, getVersion);

  useEffect(() => {
    if (enabled) reloadQuizzes();
  }, [enabled]);

  return {
    quizzes: list || [],
    loading: list === null && !listError,
    error: list === null ? listError : "",
  };
}

function toSummary(quiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    tags: quiz.tags || [],
    status: quiz.status,
    visibility: quiz.visibility,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt || new Date().toISOString(),
    questionCount: quiz.questionCount ?? quiz.questions?.length ?? 0,
  };
}

/** Put a created/saved quiz into both caches. */
export function upsertQuiz(quiz, { withQuestions = false } = {}) {
  const summary = toSummary(quiz);
  if (list) {
    list = [summary, ...list.filter((item) => item.id !== quiz.id)];
  }
  if (withQuestions) {
    details.set(quiz.id, { quiz, at: Date.now() });
  } else {
    const cached = details.get(quiz.id);
    if (cached) details.set(quiz.id, { quiz: { ...cached.quiz, ...summary }, at: cached.at });
  }
  emit();
}

export function removeQuiz(id) {
  if (list) list = list.filter((item) => item.id !== id);
  details.delete(id);
  emit();
}

export function restoreQuizzes(snapshot) {
  list = snapshot;
  emit();
}

export function getQuizListSnapshot() {
  return list;
}

export function clearQuizCache() {
  list = null;
  listError = "";
  details.clear();
  detailErrors.clear();
  emit();
}

const detailRequests = new Map();

export function fetchQuiz(id) {
  if (detailRequests.has(id)) return detailRequests.get(id);
  const request = apiRequest(`/api/quizzes/${id}`)
    .then(({ quiz }) => {
      details.set(id, { quiz, at: Date.now() });
      return quiz;
    })
    .finally(() => detailRequests.delete(id));
  detailRequests.set(id, request);
  return request;
}

export function getCachedQuiz(id, maxAgeMs = Infinity) {
  const entry = details.get(id);
  if (!entry || Date.now() - entry.at > maxAgeMs) return null;
  return entry.quiz;
}

/** Warm the cache on hover so the next page opens without a spinner. */
export function prefetchQuiz(id) {
  if (getCachedQuiz(id, 15_000)) return;
  fetchQuiz(id).catch(() => {});
}

/**
 * Cached-then-fresh quiz loader for read-only pages (solo, answer key).
 */
export function useQuiz(id, enabled = true) {
  useSyncExternalStore(subscribe, getVersion);
  const cached = getCachedQuiz(id);

  const load = useCallback(() => {
    return fetchQuiz(id)
      .then(() => emit())
      .catch((error) => {
        detailErrors.set(id, error.message);
        emit();
      });
  }, [id]);

  useEffect(() => {
    if (!enabled || !id) return;
    detailErrors.delete(id);
    load();
  }, [enabled, id, load]);

  const error = detailErrors.get(id) || "";
  return {
    quiz: cached,
    loading: !cached && !error,
    error: cached ? "" : error,
  };
}
