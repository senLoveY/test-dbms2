import { supabase } from "./supabase.js";

async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const KEEPALIVE_LIMIT = 60_000;

export async function apiRequest(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const body = options.body ? JSON.stringify(options.body) : undefined;
  const response = await fetch(path, {
    ...options,
    headers,
    body,
    // lets a save finish while the page is closing (browsers cap keepalive bodies at 64 KB)
    keepalive: Boolean(options.keepalive && (!body || body.length < KEEPALIVE_LIMIT)),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Ошибка запроса (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function safeSession(action) {
  try {
    return action();
  } catch {
    return null;
  }
}

export function saveRoomSession(code, roomId) {
  safeSession(() => sessionStorage.setItem(`room:${code}`, roomId));
}

export function loadRoomSession(code) {
  return safeSession(() => sessionStorage.getItem(`room:${code}`));
}

export function clearRoomSession(code) {
  safeSession(() => sessionStorage.removeItem(`room:${code}`));
}
