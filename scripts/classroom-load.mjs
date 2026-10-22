/**
 * Classroom load test: one host and N guest phones play a short quiz.
 *
 * Runs the real API handlers in-process against the Supabase project from .env
 * (needs classroom-migration.sql applied and anonymous sign-ins enabled), and
 * listens to realtime the way the app does: the host to rooms + room_players,
 * a phone to rooms only. Everything it creates is deleted at the end.
 *
 *   node scripts/classroom-load.mjs [players=40] [questions=5]
 *
 * It measures the database and API logic, not Vercel cold starts.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PLAYERS = Number(process.argv[2]) || 40;
const QUESTIONS = Number(process.argv[3]) || 5;

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
}

const { default: roomsHandler } = await import("../api/rooms.js");
// game actions are served by the rooms function (lib/gameApi.js)
const gameHandler = roomsHandler;
const { default: reportsHandler } = await import("../api/reports.js");

const url = process.env.SUPABASE_URL.replace(/\/+$/, "");
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const timings = [];
let calls = 0;

async function call(handler, group, action, token, body) {
  calls += 1;
  const started = performance.now();
  const req = {
    method: body ? "POST" : "GET",
    url: `/api/${group}/${action}`,
    headers: { authorization: `Bearer ${token}` },
    query: body ? {} : { roomId: action === "state" ? globalThis.roomId : undefined, id: group === "reports" ? action : undefined },
    body,
  };
  let status = 200;
  let payload;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      payload = data;
    },
    setHeader() {},
  };
  await handler(req, res);
  timings.push(performance.now() - started);
  if (status >= 400) throw new Error(`${group}/${action}: ${status} ${payload?.error}`);
  return payload;
}

const rooms = (action, token, body) => call(roomsHandler, "rooms", action, token, body);
const game = (action, token, body) => call(gameHandler, "game", action, token, body);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

const created = { users: [], quizId: null };

async function cleanup() {
  if (created.quizId) await admin.from("quizzes").delete().eq("id", created.quizId);
  await Promise.all(created.users.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));
}

try {
  // Host: a temporary registered account with a published quiz
  const email = `classroom-test-${Date.now()}@example.invalid`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data: hostUser, error: hostError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `test_${Date.now() % 1e6}` },
  });
  if (hostError) throw hostError;
  created.users.push(hostUser.user.id);
  const hostClient = client();
  const { data: hostSession, error: signInError } = await hostClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const hostToken = hostSession.session.access_token;

  const { data: quiz, error: quizError } = await admin
    .from("quizzes")
    .insert({ owner_id: hostUser.user.id, title: "Нагрузочный тест", status: "published" })
    .select("id")
    .single();
  if (quizError) throw quizError;
  created.quizId = quiz.id;
  const { error: questionsError } = await admin.from("quiz_questions").insert(
    Array.from({ length: QUESTIONS }, (_, i) => ({
      quiz_id: quiz.id,
      sort_order: i,
      type: "single",
      text: `Вопрос ${i + 1}`,
      options: ["А", "Б", "В", "Г"],
      correct: [i % 4],
    }))
  );
  if (questionsError) throw questionsError;

  const { room } = await rooms("create", hostToken, {
    quizId: quiz.id,
    mode: "classroom",
    settings: { questionCount: QUESTIONS, timeLimitSec: 30, revealPauseMs: 2000 },
  });
  globalThis.roomId = room.id;
  console.log(`room ${room.code} (classroom), ${PLAYERS} guests, ${QUESTIONS} questions`);

  // Guests: anonymous sign-in + join, all at once like a class scanning the QR
  const signIns = await Promise.allSettled(
    Array.from({ length: PLAYERS }, async (_, i) => {
      const phone = client();
      const { data, error } = await phone.auth.signInAnonymously();
      if (error) throw error;
      created.users.push(data.user.id);
      await rooms("join", data.session.access_token, { code: room.code, nickname: `Ученик ${i + 1}` });
      return { phone, token: data.session.access_token, id: data.user.id };
    })
  );
  const phones = signIns.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failed = signIns.filter((r) => r.status === "rejected");
  console.log(`joined: ${phones.length}/${PLAYERS}`);
  if (failed.length) console.log(`join failures, e.g.: ${failed[0].reason?.message}`);
  if (!phones.length) throw new Error("nobody could join");

  // Realtime as the app does it: host follows players too, a phone only the room row
  const events = { host: 0, phone: 0 };
  const subscribe = (supabase, label, withPlayers) =>
    new Promise((resolve) => {
      let channel = supabase
        .channel(`load:${label}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, () => {
          events[label] += 1;
        });
      if (withPlayers) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${room.id}` },
          () => {
            events[label] += 1;
          }
        );
      }
      channel.subscribe((status) => status === "SUBSCRIBED" && resolve(channel));
      setTimeout(() => resolve(channel), 8000);
    });
  await Promise.all([subscribe(hostClient, "host", true), subscribe(phones[0].phone, "phone", false)]);

  // A guest goes straight to the database with its own token: it must not reach anything
  const guestDb = phones[0].phone;
  const probes = {
    "read other people's quizzes": (await guestDb.from("quizzes").select("id").limit(5)).data?.length > 0,
    "read room answers (snapshots)": (await guestDb.from("room_snapshots").select("room_id").limit(1)).data?.length > 0,
    "read other players' answers": !(await guestDb.from("room_players").select("last_answer").limit(1)).error,
    "write room_players": !(await guestDb.from("room_players").update({ score: 99999 }).eq("room_id", room.id)).error,
    "create a room": !(await guestDb.from("rooms").insert({ code: "ZZZZZZ", host_id: phones[0].id })).error,
    "call room RPCs": !(await guestDb.rpc("room_state", { p_room_id: room.id })).error,
  };
  const leaks = Object.entries(probes).filter(([, leaked]) => leaked).map(([name]) => name);
  console.log(leaks.length ? `GUEST ACCESS LEAKS: ${leaks.join(", ")}` : "guest direct DB access: all blocked");
  if (leaks.length) process.exitCode = 1;

  const lobby = await rooms("state", hostToken);
  console.log(`host sees ${lobby.players.length} players in the lobby`);

  let state = (await game("start", hostToken, { roomId: room.id })).state;
  const answerTimings = [];

  for (let q = 0; q < QUESTIONS; q += 1) {
    if (state.room.status !== "playing") throw new Error(`question ${q + 1}: status ${state.room.status}`);
    await Promise.all(
      phones.map(async ({ token }) => {
        await new Promise((r) => setTimeout(r, Math.random() * 1500));
        const started = performance.now();
        const { state: mine } = await game("answer", token, { roomId: room.id, selected: [Math.floor(Math.random() * 4)] });
        answerTimings.push(performance.now() - started);
        if (mine.players.length !== 1) throw new Error("a phone received other players");
      })
    );
    state = await rooms("state", hostToken);
    if (state.room.status !== "revealing") throw new Error(`question ${q + 1}: not revealed after everyone answered`);
    const counted = state.classroom.distribution.reduce((a, b) => a + b, 0);
    console.log(`Q${q + 1}: revealed, ${counted}/${phones.length} answers counted, leader ${state.players[0].username} ${state.players[0].score}`);
    state = (await game("advance", hostToken, { roomId: room.id, index: state.room.current_index })).state;
  }

  if (state.room.status !== "finished") throw new Error(`expected finished, got ${state.room.status}`);
  const phoneView = await rooms("state", phones[0].token);
  console.log(`phone 1 finished at place ${phoneView.classroom.rank}/${phoneView.classroom.playerCount}`);

  // The lesson report was written at each reveal; the host opens it by room id
  const { report } = await call(reportsHandler, "reports", room.id, hostToken);
  const answersAdd = report.questions.every(
    (q) => q.options.reduce((sum, option) => sum + option.count, 0) === phones.length
  );
  console.log(
    `report: ${report.questionsPlayed}/${QUESTIONS} questions, ${report.playerCount} players, ` +
      `answers add up: ${answersAdd}, average ${report.averagePercent}%, to go over: ${report.struggles.length}`
  );
  if (report.questionsPlayed !== QUESTIONS || report.playerCount !== phones.length || !answersAdd) {
    throw new Error("lesson report doesn't match the game");
  }
  // the screen's option order can be rebuilt only if the question id was recorded
  const { data: raw } = await admin.from("class_reports").select("questions").eq("room_id", room.id).single();
  if (!raw.questions.every((q) => q.id && typeof q.shuffled === "boolean")) {
    throw new Error("report entries lack the question id / shuffle flag: rerun class-reports-migration.sql");
  }

  await new Promise((r) => setTimeout(r, 1500));
  console.log(`API calls: ${calls}; answer latency p50 ${percentile(answerTimings, 50).toFixed(0)} ms, p95 ${percentile(answerTimings, 95).toFixed(0)} ms`);
  console.log(`realtime events: host ${events.host}, one phone ${events.phone} (phones should see only question changes)`);
  console.log("OK");
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  process.exit();
}
