import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import Menu from "../components/Menu.jsx";
import OptionList from "../components/OptionList.jsx";
import PageLayout from "../components/PageLayout.jsx";
import RoomSettingsForm, { DEFAULT_ROOM_SETTINGS } from "../components/RoomSettingsForm.jsx";
import RoomSettingsSummary from "../components/RoomSettingsSummary.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { useHotkeys } from "../hooks/useHotkeys.js";
import { useRoomState } from "../hooks/useRoomState.js";
import { normalizeRoomSettings } from "../../lib/roomSettings.js";
import { clearRoomSession } from "../lib/api.js";
import { formatPoints, formatQuestions, pad2 } from "../lib/format.js";

const SETTINGS_SAVE_DELAY_MS = 450;

/* ——— Shared bits ——— */

function CountdownBar({ startedAt, endsAt, now, tone = "default" }) {
  const total = Math.max(1, endsAt - startedAt);
  const elapsed = Math.min(total, Math.max(0, now() - startedAt));
  return (
    <div className={`countdown countdown-${tone}`} aria-hidden="true">
      <span
        key={`${startedAt}-${endsAt}`}
        style={{ "--d": `${total}ms`, "--delay": `-${elapsed}ms` }}
      />
    </div>
  );
}

/** Seconds until the deadline, derived during render so it's never stale after a question change. */
function useSecondsLeft(deadline, now, active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !deadline) return undefined;
    const id = setInterval(() => setTick((value) => value + 1), 200);
    return () => clearInterval(id);
  }, [deadline, active]);
  if (!active || !deadline) return 0;
  return Math.max(0, Math.ceil((deadline - now()) / 1000));
}

function PlayerScore({ player, isMe, revealing, phase }) {
  const previous = Math.max(0, player.score - (player.roundPoints ?? 0));
  const value = useAnimatedNumber(previous, player.score, revealing, 900);
  const status =
    phase === "playing" ? (player.has_answered ? "ответил" : "думает…") : null;

  return (
    <div className={`vs-player ${isMe ? "is-me" : ""} ${player.has_answered && phase === "playing" ? "is-done" : ""}`}>
      <span className="vs-name">
        {player.username}
        {isMe && <span className="vs-you">вы</span>}
      </span>
      <span className="vs-score">{value}</span>
      {revealing && player.roundPoints != null && (
        <span className={`vs-delta ${player.roundPoints > 0 ? "is-plus" : ""}`}>+{player.roundPoints}</span>
      )}
      {status && <span className="vs-status">{status}</span>}
    </div>
  );
}

function Scoreboard({ players, userId, phase }) {
  const me = players.find((p) => p.user_id === userId);
  const others = players.filter((p) => p.user_id !== userId);
  const ordered = me ? [me, ...others] : others;
  return (
    <div className="vs">
      {ordered.map((player, index) => (
        <PlayerScore
          key={player.user_id}
          player={player}
          isMe={player.user_id === userId}
          revealing={phase === "revealing"}
          phase={phase}
          index={index}
        />
      ))}
      {ordered.length === 1 && (
        <div className="vs-player is-empty">
          <span className="vs-name">соперник вышел</span>
        </div>
      )}
    </div>
  );
}

/* ——— Lobby ——— */

function Lobby({ state, userId, code, act, onLeave }) {
  const { toast } = useFeedback();
  const isHost = state.room.host_id === userId;
  const players = state.players;
  const [settings, setSettings] = useState(state.settings || DEFAULT_ROOM_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);

  // Follow server settings unless the host has unsaved edits
  useEffect(() => {
    if (!pendingRef.current) setSettings(state.settings || DEFAULT_ROOM_SETTINGS);
  }, [state.settings]);

  const flushSettings = useCallback(async () => {
    clearTimeout(timerRef.current);
    const next = pendingRef.current;
    if (!next) return true;
    setSavingSettings(true);
    try {
      await act("/api/rooms/settings", { settings: normalizeRoomSettings(next) });
      if (pendingRef.current === next) pendingRef.current = null;
      return true;
    } catch (err) {
      toast(err.message, { tone: "bad" });
      return false;
    } finally {
      setSavingSettings(false);
    }
  }, [act, toast]);

  function changeSettings(next) {
    setSettings(next);
    pendingRef.current = next;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushSettings, SETTINGS_SAVE_DELAY_MS);
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function start() {
    setStarting(true);
    try {
      if (!(await flushSettings())) return;
      await act("/api/game/start");
    } catch (err) {
      toast(err.message, { tone: "bad" });
    } finally {
      setStarting(false);
    }
  }

  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Не получилось скопировать", { tone: "bad" });
    }
  }

  const inviteUrl = `${window.location.origin}/multi/join?code=${code}`;
  const ready = players.length >= 2;

  useHotkeys({ Enter: () => isHost && ready && !starting && start() });

  return (
    <PageLayout className="lobby">
      <div className="lobby-head">
        <div>
          <p className="eyebrow">Лобби</p>
          <h1 className="page-title">{state.quiz.title || "Дуэль"}</h1>
          <p className="lead">{formatQuestions(state.quiz.questionCount)} в тесте</p>
        </div>
        <div className="code-card">
          <span className="code-label">Код комнаты</span>
          <button
            type="button"
            className="code-value"
            onClick={() => copy(code, "Код скопирован")}
            title="Скопировать код"
          >
            {code}
          </button>
          <button type="button" className="link-btn" onClick={() => copy(inviteUrl, "Ссылка-приглашение скопирована")}>
            Скопировать ссылку
          </button>
        </div>
      </div>

      <div className="lobby-grid">
        <section>
          <h2 className="section-title">Игроки</h2>
          <ul className="slots">
            {[0, 1].map((slot) => {
              const player = players[slot];
              if (!player) {
                return (
                  <li className="slot slot-empty" key={slot}>
                    <span className="pulse-dot" aria-hidden="true" />
                    Ждём соперника — отправьте ему код или ссылку
                  </li>
                );
              }
              return (
                <li className="slot" key={player.user_id}>
                  <span className="avatar" aria-hidden="true">
                    {player.username?.[0]?.toUpperCase()}
                  </span>
                  <span className="slot-name">{player.username}</span>
                  {player.user_id === state.room.host_id && <span className="pill">хост</span>}
                  {player.user_id === userId && <span className="pill pill-quiet">вы</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <div className="section-head">
            <h2 className="section-title">Правила</h2>
            {isHost && (
              <span className="muted small">{savingSettings ? "Сохраняем…" : "Сохраняются сами"}</span>
            )}
          </div>
          {isHost ? (
            <RoomSettingsForm
              settings={settings}
              maxQuestions={state.quiz.questionCount}
              onChange={changeSettings}
            />
          ) : (
            <RoomSettingsSummary settings={state.settings} />
          )}
        </section>
      </div>

      <div className="sticky-actions">
        <Button variant="ghost" onClick={onLeave}>
          Выйти из комнаты
        </Button>
        {isHost ? (
          <Button variant="accent" size="lg" onClick={start} loading={starting} disabled={!ready} kbd={ready ? "↵" : undefined}>
            {ready ? "Начать игру" : "Нужен второй игрок"}
          </Button>
        ) : (
          <p className="waiting">
            <span className="pulse-dot" aria-hidden="true" />
            Хост скоро начнёт игру
          </p>
        )}
      </div>
    </PageLayout>
  );
}

/* ——— Game ——— */

function Game({ state, userId, act, now, onLeave }) {
  const { toast, confirm } = useFeedback();
  const { room, settings, players } = state;
  const question = state.currentQuestion;
  const me = players.find((p) => p.user_id === userId);
  const opponent = players.find((p) => p.user_id !== userId);
  const isHost = room.host_id === userId;
  const phase = room.status;
  const total = room.question_ids?.length || settings.questionCount;
  const roundKey = `${room.current_index}:${phase}`;

  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const selectedRef = useRef([]);
  selectedRef.current = selected;
  const timeoutHandledRef = useRef("");

  useEffect(() => {
    if (phase === "playing") setSelected([]);
  }, [room.current_index, phase]);

  const deadline = room.question_deadline_at ? new Date(room.question_deadline_at).getTime() : 0;
  const startedAt = room.question_started_at ? new Date(room.question_started_at).getTime() : 0;
  const secondsLeft = useSecondsLeft(deadline, now, phase === "playing");
  const answered = Boolean(me?.has_answered);

  const submit = useCallback(
    async (choice = selectedRef.current) => {
      if (!choice.length || submitting) return;
      setSubmitting(true);
      try {
        await act("/api/game/answer", { selected: choice });
      } catch (err) {
        toast(err.message, { tone: "bad" });
      } finally {
        setSubmitting(false);
      }
    },
    [act, submitting, toast]
  );

  // Deadline: auto-submit the pending choice or tell the server time is up
  useEffect(() => {
    if (phase !== "playing" || secondsLeft > 0 || !deadline || now() < deadline) return;
    if (timeoutHandledRef.current === roundKey) return;
    timeoutHandledRef.current = roundKey;

    const pending = selectedRef.current;
    const run =
      !answered && pending.length && settings.autoSubmitOnTimeout
        ? act("/api/game/answer", { selected: pending })
        : act("/api/game/timeout");
    run.catch(() => {
      timeoutHandledRef.current = "";
    });
  }, [phase, secondsLeft, deadline, answered, roundKey, settings.autoSubmitOnTimeout, act, now]);

  // Host moves on after the reveal pause
  useEffect(() => {
    if (!isHost || phase !== "revealing") return undefined;
    const timer = setTimeout(() => {
      act("/api/game/advance", { index: room.current_index }).catch(() => {});
    }, settings.revealPauseMs);
    return () => clearTimeout(timer);
  }, [isHost, phase, room.current_index, settings.revealPauseMs, act]);

  function toggle(index) {
    if (!question || answered || phase !== "playing" || index >= question.options.length) return;
    if (question.type === "single") {
      setSelected([index]);
      return;
    }
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  }

  useHotkeys({
    digit: toggle,
    Enter: () => phase === "playing" && !answered && submit(),
  });

  async function endGame() {
    const ok = await confirm({
      title: "Завершить игру?",
      body: "Счёт зафиксируется, оба игрока увидят итоги.",
      confirmText: "Завершить",
      tone: "danger",
    });
    if (!ok) return;
    act("/api/game/end").catch((err) => toast(err.message, { tone: "bad" }));
  }

  // Reveal: grade options by text, show where the opponent clicked
  const reveal = phase === "revealing" ? state.reveal : null;
  const optionStates = useMemo(() => {
    if (!reveal || !question) return null;
    const correct = new Set(reveal.correctOptions);
    const mine = new Set((me?.answerBreakdown || []).map((item) => item.label));
    return question.options.map((option) => {
      if (correct.has(option)) return mine.has(option) ? "right-selected" : "right-missed";
      return mine.has(option) ? "wrong-selected" : "neutral";
    });
  }, [reveal, question, me]);

  const optionMarks = useMemo(() => {
    if (!reveal || !question || !opponent) return null;
    const picked = new Set((opponent.answerBreakdown || []).map((item) => item.label));
    return question.options.map((option) => (picked.has(option) ? [opponent.username] : []));
  }, [reveal, question, opponent]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const revealStart = useMemo(() => (phase === "revealing" ? now() : 0), [phase, room.current_index]);
  const urgent = phase === "playing" && secondsLeft <= 5;
  const myRound = me?.roundPoints;

  return (
    <PageLayout width="narrow" className="play duel">
      <div className="play-top">
        <span className="play-counter">
          {pad2(room.current_index + 1)} <span className="muted">/ {pad2(total)}</span>
        </span>
        <span className={`timer ${urgent ? "is-urgent" : ""}`} aria-live="off">
          {phase === "playing" ? `0:${pad2(secondsLeft)}` : "разбор"}
        </span>
        <Menu
          label="Меню игры"
          items={[
            isHost && { label: "Завершить игру", onClick: endGame },
            { label: "Выйти из комнаты", tone: "danger", onClick: onLeave },
          ]}
        />
      </div>

      {phase === "playing" && deadline > 0 && (
        <CountdownBar startedAt={startedAt} endsAt={deadline} now={now} tone={urgent ? "urgent" : "default"} />
      )}
      {phase === "revealing" && revealStart > 0 && (
        <CountdownBar
          startedAt={revealStart}
          endsAt={revealStart + settings.revealPauseMs}
          now={now}
          tone="quiet"
        />
      )}

      <Scoreboard players={players} userId={userId} phase={phase} />

      {question && (
        <div className="question" key={room.current_index}>
          <p className="question-type">
            {question.type === "multiple" ? "Несколько ответов" : "Один ответ"} · быстрее — больше очков
          </p>
          <h1 className="question-text">{question.text}</h1>

          <OptionList
            options={question.options}
            type={question.type}
            selected={phase === "playing" ? selected : []}
            onToggle={toggle}
            locked={answered || phase !== "playing"}
            states={optionStates}
            marks={optionMarks}
          />

          <div className="play-actions">
            {phase === "playing" && !answered && (
              <>
                <p className="muted small">
                  {selected.length && settings.autoSubmitOnTimeout
                    ? "Отправится само, когда выйдет время"
                    : ""}
                </p>
                <Button
                  variant="primary"
                  onClick={() => submit()}
                  disabled={!selected.length}
                  loading={submitting}
                  kbd="↵"
                >
                  Ответить
                </Button>
              </>
            )}
            {phase === "playing" && answered && (
              <p className="waiting">
                <span className="pulse-dot" aria-hidden="true" />
                Ответ принят — ждём {opponent?.username || "соперника"}
              </p>
            )}
            {phase === "revealing" && (
              <p className={`verdict ${myRound > 0 ? "verdict-good" : "verdict-bad"}`}>
                {myRound > 0 ? `+${formatPoints(myRound)} за раунд` : "Без очков в этом раунде"}
              </p>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}

/* ——— Result ——— */

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => ({
        left: `${(index * 37) % 100}%`,
        delay: `${(index % 7) * 0.09}s`,
        duration: `${1.8 + (index % 5) * 0.3}s`,
        rotate: `${(index * 47) % 360}deg`,
        drift: `${((index % 5) - 2) * 18}px`,
      })),
    []
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            "--r": piece.rotate,
            "--x": piece.drift,
          }}
        />
      ))}
    </div>
  );
}

function Result({ state, userId, onExit }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const alone = ranked.length < 2;
  const draw = !alone && ranked[0].score === ranked[1].score;
  const won = !alone && !draw && ranked[0].user_id === userId;
  const headline = alone ? "Игра завершена" : draw ? "Ничья" : won ? "Победа" : "Поражение";
  const note = alone
    ? "Соперник вышел или игра была остановлена."
    : draw
      ? "Одинаковый счёт — нужен реванш."
      : won
        ? "Вы набрали больше очков."
        : "В этот раз соперник был быстрее.";

  return (
    <PageLayout width="narrow" className={`result ${won ? "is-win" : ""}`}>
      {won && <Confetti />}
      <p className="eyebrow">{state.quiz.title}</p>
      <h1 className="result-title">{headline}</h1>
      <p className="lead">{note}</p>

      <ol className="podium">
        {ranked.map((player, index) => (
          <li
            key={player.user_id}
            className={`podium-row ${index === 0 && !draw && !alone ? "is-first" : ""}`}
            style={{ "--i": index }}
          >
            <span className="podium-place">{index + 1}</span>
            <span className="podium-name">
              {player.username}
              {player.user_id === userId && <span className="vs-you">вы</span>}
            </span>
            <span className="podium-score">{player.score}</span>
          </li>
        ))}
      </ol>

      <div className="row">
        <Button variant="primary" onClick={() => onExit("/")}>
          На главную
        </Button>
        <Button variant="secondary" onClick={() => onExit("/me/quizzes")}>
          Мои тесты
        </Button>
      </div>
    </PageLayout>
  );
}

/* ——— Page ——— */

export default function RoomPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm, toast } = useFeedback();
  const { state, error, loading, act, now } = useRoomState(code);

  const exit = useCallback(
    (to) => {
      clearRoomSession(code);
      navigate(to);
    },
    [code, navigate]
  );

  const leave = useCallback(async () => {
    const inGame = state?.room?.status === "playing" || state?.room?.status === "revealing";
    const ok = await confirm({
      title: "Выйти из комнаты?",
      body: inGame ? "Игра закончится и для соперника." : "Вернуться можно будет по коду, пока игра не началась.",
      confirmText: "Выйти",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await act("/api/rooms/leave");
    } catch (err) {
      toast(err.message, { tone: "bad" });
    }
    exit("/");
  }, [state?.room?.status, confirm, act, toast, exit]);

  if (!state && loading) return <PageSkeleton />;

  if (!state) {
    return (
      <PageLayout width="narrow">
        <p className="eyebrow">Комната {code}</p>
        <h1 className="page-title">Комната недоступна</h1>
        <p className="lead">{error || "Возможно, игра уже закончилась или вы в ней не участвуете."}</p>
        <div className="row">
          <Button variant="primary" to={`/multi/join?code=${code}`}>
            Присоединиться по коду
          </Button>
          <Button variant="ghost" to="/">
            На главную
          </Button>
        </div>
      </PageLayout>
    );
  }

  const status = state.room.status;
  if (status === "waiting") {
    return <Lobby state={state} userId={user.id} code={code} act={act} onLeave={leave} />;
  }
  if (status === "finished") {
    return <Result state={state} userId={user.id} onExit={exit} />;
  }
  return <Game state={state} userId={user.id} act={act} now={now} onLeave={leave} />;
}
