import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../components/Button.jsx";
import { CountdownBar, useSecondsLeft } from "../../components/Countdown.jsx";
import { useFeedback } from "../../components/Feedback.jsx";
import QrCode from "../../components/QrCode.jsx";
import RoomSettingsSummary from "../../components/RoomSettingsSummary.jsx";
import { useHotkeys } from "../../hooks/useHotkeys.js";
import { OPTION_LETTERS, classroomJoinUrl, downloadResultsCsv } from "../../lib/classroom.js";
import { formatQuestions, pad2, plural } from "../../lib/format.js";

/** Late answers from phones get this long to arrive before the screen closes the question. */
const DEADLINE_GRACE_MS = 1000;
const LEADERBOARD_SIZE = 5;

function formatPeople(count) {
  return plural(count, ["участник", "участника", "участников"]);
}

function FullscreenButton() {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!document.documentElement.requestFullscreen) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        (active ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})
      }
    >
      {active ? "Обычный режим" : "На весь экран"}
    </Button>
  );
}

/* ——— Lobby ——— */

function ScreenLobby({ state, code, act, onExit }) {
  const { toast, confirm } = useFeedback();
  const [starting, setStarting] = useState(false);
  const players = state.players;
  const joinUrl = classroomJoinUrl(code);
  const ready = players.length > 0;

  async function start() {
    if (!ready || starting) return;
    setStarting(true);
    try {
      await act("/api/game/start");
    } catch (err) {
      toast(err.message, { tone: "bad" });
      setStarting(false);
    }
  }

  async function kick(player) {
    const ok = await confirm({
      title: `Убрать «${player.username}»?`,
      body: "Участник сможет зайти снова под другим именем.",
      confirmText: "Убрать",
      tone: "danger",
    });
    if (!ok) return;
    act("/api/rooms/kick", { userId: player.user_id }).catch((err) => toast(err.message, { tone: "bad" }));
  }

  useHotkeys({ Enter: start });

  return (
    <div className="cls-screen cls-lobby">
      <header className="cls-top">
        <p className="eyebrow">{state.quiz.title}</p>
        <div className="row row-tight">
          <FullscreenButton />
          <Button variant="ghost" size="sm" onClick={onExit}>
            Закрыть комнату
          </Button>
        </div>
      </header>

      <div className="cls-join">
        <QrCode value={joinUrl} label={`QR-код для входа: ${joinUrl}`} />
        <div className="cls-join-text">
          <p className="cls-join-step">Откройте камеру и наведите на код или зайдите на</p>
          <p className="cls-join-url">{joinUrl.replace(/^https?:\/\//, "").replace(/\/play\/.*$/, "/play")}</p>
          <p className="cls-join-step">и введите код</p>
          <p className="cls-code">{code}</p>
        </div>
      </div>

      <section className="cls-roster" aria-live="polite">
        <h2 className="section-title">
          {players.length ? formatPeople(players.length) : "Ждём участников"}
        </h2>
        {players.length > 0 ? (
          <ul className="cls-chips">
            {players.map((player) => (
              <li className="cls-chip" key={player.user_id}>
                {player.username}
                <button
                  type="button"
                  className="cls-chip-x"
                  aria-label={`Убрать ${player.username}`}
                  onClick={() => kick(player)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="waiting">
            <span className="pulse-dot" aria-hidden="true" />
            Имена появятся здесь, как только участники войдут
          </p>
        )}
      </section>

      <details className="cls-rules">
        <summary>
          Правила: {formatQuestions(state.settings.questionCount)}, {state.settings.timeLimitSec} с на вопрос
        </summary>
        <RoomSettingsSummary settings={state.settings} />
      </details>

      <div className="cls-actions">
        <Button variant="accent" size="lg" onClick={start} loading={starting} disabled={!ready} kbd={ready ? "↵" : undefined}>
          {ready ? "Начать" : "Нужен хотя бы один участник"}
        </Button>
      </div>
    </div>
  );
}

/* ——— Question and reveal ——— */

function Leaderboard({ players }) {
  return (
    <ol className="cls-board">
      {players.slice(0, LEADERBOARD_SIZE).map((player, index) => (
        <li key={player.user_id} className="cls-board-row" style={{ "--i": index }}>
          <span className="cls-board-place">{index + 1}</span>
          <span className="cls-board-name">{player.username}</span>
          {player.roundPoints > 0 && <span className="cls-board-delta">+{player.roundPoints}</span>}
          <span className="cls-board-score">{player.score}</span>
        </li>
      ))}
    </ol>
  );
}

function ScreenQuestion({ state, act, now, onEnd }) {
  const { room, settings, classroom } = state;
  const question = state.currentQuestion;
  const phase = room.status;
  const revealing = phase === "revealing";
  const total = room.question_ids?.length || settings.questionCount;
  const roundKey = `${room.current_index}:${phase}`;

  const deadline = room.question_deadline_at ? new Date(room.question_deadline_at).getTime() : 0;
  const startedAt = room.question_started_at ? new Date(room.question_started_at).getTime() : 0;
  const secondsLeft = useSecondsLeft(deadline, now, phase === "playing");
  const urgent = phase === "playing" && secondsLeft <= 5;

  // The screen closes the question for everyone once time is up (phones don't, to spare requests)
  const closedRef = useRef("");
  useEffect(() => {
    if (phase !== "playing" || !deadline) return undefined;
    const wait = Math.max(0, deadline + DEADLINE_GRACE_MS - now());
    const timer = setTimeout(() => {
      if (closedRef.current === roundKey) return;
      closedRef.current = roundKey;
      act("/api/game/timeout").catch(() => {
        closedRef.current = "";
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [phase, deadline, roundKey, act, now]);

  // After the reveal: move on by itself unless paused; Space moves on now
  const [paused, setPaused] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const revealStart = useMemo(() => (revealing ? now() : 0), [revealing, room.current_index]);
  const advance = () => act("/api/game/advance", { index: room.current_index }).catch(() => {});
  const togglePause = () => revealing && setPaused((value) => !value);

  useEffect(() => {
    setPaused(false);
  }, [room.current_index]);

  useEffect(() => {
    if (!revealing || paused) return undefined;
    const timer = setTimeout(advance, settings.revealPauseMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing, paused, room.current_index, settings.revealPauseMs]);

  useHotkeys({
    " ": () => revealing && advance(),
    p: togglePause,
    P: togglePause,
    "з": togglePause,
    "З": togglePause,
  });

  const correct = new Set(state.reveal?.correctOptions || []);
  const counts = classroom.distribution;
  const maxCount = counts ? Math.max(1, ...counts) : 1;
  const isLast = room.current_index + 1 >= total;

  return (
    <div className={`cls-screen cls-play ${revealing ? "is-revealing" : ""}`}>
      <header className="cls-top">
        <span className="cls-counter">
          {pad2(room.current_index + 1)} <span className="muted">/ {pad2(total)}</span>
        </span>
        <span className={`cls-timer ${urgent ? "is-urgent" : ""}`}>
          {phase === "playing" ? secondsLeft : "разбор"}
        </span>
        <div className="row row-tight">
          <FullscreenButton />
          <Button variant="ghost" size="sm" onClick={onEnd}>
            Завершить
          </Button>
        </div>
      </header>

      {phase === "playing" && deadline > 0 && (
        <CountdownBar startedAt={startedAt} endsAt={deadline} now={now} tone={urgent ? "urgent" : "default"} />
      )}
      {revealing && revealStart > 0 && !paused && (
        <CountdownBar startedAt={revealStart} endsAt={revealStart + settings.revealPauseMs} now={now} tone="quiet" />
      )}

      {question && (
        <div className="cls-stage" key={room.current_index}>
          <h1 className="cls-question">{question.text}</h1>
          {question.type === "multiple" && <p className="cls-hint">Несколько правильных ответов</p>}

          <ul className="cls-options">
            {question.options.map((option, index) => {
              const isRight = correct.has(option);
              const count = counts?.[index] ?? 0;
              return (
                <li
                  key={`${index}-${option}`}
                  className={`cls-option ${revealing ? (isRight ? "is-right" : "is-dim") : ""}`}
                  style={{ "--opt": `var(--opt-${(index % 6) + 1})`, "--share": count / maxCount }}
                >
                  <span className="cls-letter">{OPTION_LETTERS[index]}</span>
                  <span className="cls-option-text">{option}</span>
                  {revealing && <span className="cls-option-count">{count}</span>}
                  {revealing && <span className="cls-option-bar" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>

          <footer className="cls-foot">
            {phase === "playing" ? (
              <p className="cls-answered" aria-live="polite">
                Ответили <strong>{classroom.answered}</strong> из {classroom.playerCount}
              </p>
            ) : (
              <>
                <Leaderboard players={state.players} />
                <div className="cls-next">
                  <Button variant="primary" size="lg" onClick={advance} kbd="␣">
                    {isLast ? "Итоги" : "Следующий вопрос"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPaused((value) => !value)}>
                    {paused ? "Продолжить автопереход" : "Пауза (P)"}
                  </Button>
                </div>
              </>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}

/* ——— Final ——— */

function ScreenFinal({ state, onExit }) {
  const players = state.players;
  const podium = players.slice(0, 3);
  const total = state.room.question_ids?.length || state.settings.questionCount;

  return (
    <div className="cls-screen cls-final">
      <header className="cls-top">
        <p className="eyebrow">{state.quiz.title}</p>
        <FullscreenButton />
      </header>

      <h1 className="cls-final-title">Итоги</h1>

      {podium.length > 0 ? (
        <ol className="cls-podium">
          {podium.map((player, index) => (
            <li key={player.user_id} className={`cls-step cls-step-${index + 1}`} style={{ "--i": index }}>
              <span className="cls-step-name">{player.username}</span>
              <span className="cls-step-score">{player.score}</span>
              <span className="cls-step-place">{index + 1}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="lead">Участников не осталось.</p>
      )}

      {players.length > 3 && (
        <ol className="cls-table" start={4}>
          {players.slice(3).map((player) => (
            <li key={player.user_id}>
              <span>{player.username}</span>
              <span className="cls-table-score">{player.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="cls-actions">
        {players.length > 0 && (
          <>
            <Button variant="accent" to={`/me/reports/${state.room.id}`}>
              Отчёт по уроку
            </Button>
            <Button variant="secondary" onClick={() => downloadResultsCsv(state.quiz.title, players, total)}>
              Скачать результаты (CSV)
            </Button>
          </>
        )}
        <Button variant="primary" onClick={onExit}>
          Готово
        </Button>
      </div>
    </div>
  );
}

/* ——— Screen ——— */

export default function ClassroomScreen({ state, code, act, now, onExit }) {
  const { toast, confirm } = useFeedback();
  const status = state.room.status;

  async function endGame() {
    const ok = await confirm({
      title: "Завершить игру?",
      body: "Участники сразу увидят итоги.",
      confirmText: "Завершить",
      tone: "danger",
    });
    if (!ok) return;
    act("/api/game/end").catch((err) => toast(err.message, { tone: "bad" }));
  }

  async function closeLobby() {
    const ok = await confirm({
      title: "Закрыть комнату?",
      body: "Участники не смогут войти по этому коду.",
      confirmText: "Закрыть",
      tone: "danger",
    });
    if (!ok) return;
    await act("/api/game/end").catch(() => {});
    onExit("/");
  }

  if (status === "waiting") return <ScreenLobby state={state} code={code} act={act} onExit={closeLobby} />;
  if (status === "finished") return <ScreenFinal state={state} onExit={() => onExit("/")} />;
  return <ScreenQuestion state={state} act={act} now={now} onEnd={endGame} />;
}
