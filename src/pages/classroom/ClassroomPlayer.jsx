import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../components/Button.jsx";
import { CountdownBar, useSecondsLeft } from "../../components/Countdown.jsx";
import { useFeedback } from "../../components/Feedback.jsx";
import { OPTION_LETTERS } from "../../lib/classroom.js";
import { formatPoints, pad2 } from "../../lib/format.js";

/**
 * If the host's screen is gone, a phone closes the question itself, but only
 * well after the deadline so normally the screen does it (one request, not thirty).
 */
const FALLBACK_TIMEOUT_MS = 6000;

function Standing({ classroom, me }) {
  if (!me || !classroom.rank) return null;
  return (
    <p className="cls-standing">
      Место <strong>{classroom.rank}</strong> из {classroom.playerCount} · {formatPoints(me.score)}
    </p>
  );
}

function Waiting({ me, onLeave }) {
  return (
    <div className="cls-phone cls-phone-wait">
      <p className="eyebrow">Вы в игре</p>
      <h1 className="cls-phone-name">{me?.username}</h1>
      <p className="waiting">
        <span className="pulse-dot" aria-hidden="true" />
        Ждём, когда ведущий начнёт. Вопросы появятся на большом экране и здесь.
      </p>
      <Button variant="ghost" size="sm" onClick={onLeave}>
        Выйти
      </Button>
    </div>
  );
}

function Final({ state, me, onLeave }) {
  const { classroom } = state;
  return (
    <div className="cls-phone cls-phone-final">
      <p className="eyebrow">{state.quiz.title}</p>
      <h1 className="cls-phone-big">{classroom.rank ? `${classroom.rank} место` : "Игра окончена"}</h1>
      {me && <p className="lead">{formatPoints(me.score)}</p>}
      {classroom.podium?.length > 0 && (
        <ol className="podium">
          {classroom.podium.map((player, index) => (
            <li key={`${index}-${player.username}`} className={`podium-row ${index === 0 ? "is-first" : ""}`} style={{ "--i": index }}>
              <span className="podium-place">{index + 1}</span>
              <span className="podium-name">{player.username}</span>
              <span className="podium-score">{player.score}</span>
            </li>
          ))}
        </ol>
      )}
      <Button variant="primary" onClick={onLeave}>
        Готово
      </Button>
    </div>
  );
}

function Question({ state, me, act, now }) {
  const { toast } = useFeedback();
  const { room, settings, classroom } = state;
  const question = state.currentQuestion;
  const phase = room.status;
  const total = room.question_ids?.length || settings.questionCount;
  const roundKey = `${room.current_index}`;

  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const selectedRef = useRef([]);
  selectedRef.current = selected;

  useEffect(() => {
    setSelected([]);
  }, [room.current_index]);

  const deadline = room.question_deadline_at ? new Date(room.question_deadline_at).getTime() : 0;
  const startedAt = room.question_started_at ? new Date(room.question_started_at).getTime() : 0;
  const secondsLeft = useSecondsLeft(deadline, now, phase === "playing");
  const answered = Boolean(me?.has_answered);

  const submit = useCallback(
    async (choice) => {
      if (!choice.length || submitting) return;
      setSubmitting(true);
      try {
        await act("/api/game/answer", { selected: choice, index: room.current_index });
      } catch (err) {
        toast(err.message, { tone: "bad" });
      } finally {
        setSubmitting(false);
      }
    },
    [act, submitting, toast, room.current_index]
  );

  // At the deadline send a pending multiple-choice pick; long after it, close the question if the screen didn't
  const handledRef = useRef("");
  useEffect(() => {
    if (phase !== "playing" || !deadline) return undefined;
    const timers = [];
    if (!answered && settings.autoSubmitOnTimeout) {
      timers.push(
        setTimeout(() => {
          if (handledRef.current === roundKey || !selectedRef.current.length) return;
          handledRef.current = roundKey;
          submit(selectedRef.current);
        }, Math.max(0, deadline - now() - 300))
      );
    }
    timers.push(
      setTimeout(() => act("/api/game/timeout").catch(() => {}), Math.max(0, deadline + FALLBACK_TIMEOUT_MS - now()))
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, deadline, answered, roundKey, settings.autoSubmitOnTimeout, submit, act, now]);

  function pick(index) {
    if (answered || submitting || phase !== "playing") return;
    if (question.type === "single") {
      setSelected([index]);
      submit([index]);
      return;
    }
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  }

  if (!question) return null;

  const urgent = phase === "playing" && secondsLeft <= 5;
  const header = (
    <div className="cls-phone-top">
      <span className="cls-counter">
        {pad2(room.current_index + 1)} <span className="muted">/ {pad2(total)}</span>
      </span>
      <span className={`timer ${urgent ? "is-urgent" : ""}`}>{phase === "playing" ? `0:${pad2(secondsLeft)}` : "разбор"}</span>
    </div>
  );

  if (phase === "revealing") {
    const points = me?.roundPoints ?? 0;
    return (
      <div className={`cls-phone cls-phone-result ${me?.last_answer_correct ? "is-good" : "is-bad"}`}>
        {header}
        <div className="cls-phone-center">
          <h1 className="cls-phone-big">
            {me?.last_answer_correct ? "Верно!" : points > 0 ? "Почти" : me?.skipped ? "Без ответа" : "Неверно"}
          </h1>
          {points > 0 && <p className="cls-phone-points">+{points}</p>}
          {state.reveal?.correctOptions?.length > 0 && !me?.last_answer_correct && (
            <p className="muted">Правильно: {state.reveal.correctOptions.join(", ")}</p>
          )}
          <Standing classroom={classroom} me={me} />
        </div>
      </div>
    );
  }

  if (answered) {
    const late = Boolean(me?.skipped);
    return (
      <div className="cls-phone cls-phone-answered">
        {header}
        <div className="cls-phone-center">
          <h1 className="cls-phone-big">{late ? "Подключились" : "Ответ принят"}</h1>
          <p className="waiting">
            <span className="pulse-dot" aria-hidden="true" />
            {late ? "Вы зайдёте со следующего вопроса" : "Смотрите на большой экран"}
          </p>
          <Standing classroom={classroom} me={me} />
        </div>
      </div>
    );
  }

  return (
    <div className="cls-phone cls-phone-play">
      {header}
      {deadline > 0 && (
        <CountdownBar startedAt={startedAt} endsAt={deadline} now={now} tone={urgent ? "urgent" : "default"} />
      )}
      <p className="cls-phone-question">{question.text}</p>
      {question.type === "multiple" && <p className="cls-hint">Выберите все верные и нажмите «Ответить»</p>}
      <div className="cls-pad" role={question.type === "multiple" ? "group" : "radiogroup"} aria-label="Варианты ответа">
        {question.options.map((option, index) => (
          <button
            key={`${index}-${option}`}
            type="button"
            role={question.type === "multiple" ? "checkbox" : "radio"}
            aria-checked={selected.includes(index)}
            className={`cls-pad-btn ${selected.includes(index) ? "is-selected" : ""}`}
            style={{ "--opt": `var(--opt-${(index % 6) + 1})` }}
            onClick={() => pick(index)}
            disabled={submitting}
          >
            <span className="cls-letter">{OPTION_LETTERS[index]}</span>
            <span className="cls-pad-text">{option}</span>
          </button>
        ))}
      </div>
      {question.type === "multiple" && (
        <Button variant="primary" size="lg" block onClick={() => submit(selected)} disabled={!selected.length} loading={submitting}>
          Ответить
        </Button>
      )}
    </div>
  );
}

export default function ClassroomPlayer({ state, act, now, onLeave }) {
  const me = state.players[0];
  const status = state.room.status;

  if (status === "waiting") return <Waiting me={me} onLeave={onLeave} />;
  if (status === "finished") return <Final state={state} me={me} onLeave={onLeave} />;
  return <Question state={state} me={me} act={act} now={now} />;
}
