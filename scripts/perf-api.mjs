/**
 * API latency on a deployed site: a throwaway account with a 10-question quiz,
 * each endpoint called repeatedly, p50 / p95 per endpoint and the region that served it.
 * Everything it creates is deleted at the end.
 *
 *   node scripts/perf-api.mjs [https://test-dbms2.vercel.app] [rounds=15]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.argv[2] || "https://test-dbms2.vercel.app").replace(/\/+$/, "");
const ROUNDS = Number(process.argv[3]) || 15;

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
}
const url = process.env.SUPABASE_URL.replace(/\/+$/, "");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = new Map();
let region = "";

async function timed(name, path, { token, method = "GET", body } = {}) {
  const started = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  const ms = performance.now() - started;
  region = res.headers.get("x-vercel-id")?.split("::").slice(0, -1).join(" → ") || region;
  if (!res.ok) throw new Error(`${name}: ${res.status} ${data.error}`);
  if (!results.has(name)) results.set(name, []);
  results.get(name).push(ms);
  return data;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

let userId;
try {
  const email = `perf-test-${Date.now()}@example.invalid`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `perf_${Date.now() % 1e6}` },
  });
  if (error) throw error;
  userId = created.user.id;
  const signIn = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: session } = await signIn.auth.signInWithPassword({ email, password });
  const token = session.session.access_token;

  const { quiz } = await timed("POST quizzes (create)", "/api/quizzes", { token, method: "POST", body: { title: "Perf" } });
  const questions = Array.from({ length: 10 }, (_, i) => ({
    type: "single",
    text: `Вопрос ${i + 1}`,
    options: ["А", "Б", "В", "Г"],
    correct: [i % 4],
  }));
  const save = { title: "Perf", description: "", tags: [], status: "published", questions };

  for (let i = 0; i < ROUNDS; i += 1) {
    await timed("GET quizzes (list)", "/api/quizzes", { token });
    await timed("GET quizzes/:id", `/api/quizzes/${quiz.id}`, { token });
    await timed("PUT quizzes/:id (save 10 q)", `/api/quizzes/${quiz.id}`, { token, method: "PUT", body: save });
  }

  const { room } = await timed("POST rooms/create", "/api/rooms/create", {
    token,
    method: "POST",
    body: { quizId: quiz.id, mode: "classroom", settings: { questionCount: 5 } },
  });
  for (let i = 0; i < ROUNDS; i += 1) {
    await timed("GET rooms/state", `/api/rooms/state?roomId=${room.id}`, { token });
  }

  console.log(`site ${BASE}, served by ${region}, ${ROUNDS} rounds\n`);
  console.log("endpoint".padEnd(30), "first".padStart(7), "p50".padStart(7), "p95".padStart(7));
  for (const [name, values] of results) {
    console.log(
      name.padEnd(30),
      `${values[0].toFixed(0)}`.padStart(7),
      `${percentile(values, 50).toFixed(0)}`.padStart(7),
      `${percentile(values, 95).toFixed(0)}`.padStart(7)
    );
  }
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  // the account's quizzes and rooms go with it (cascade)
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  process.exit();
}
