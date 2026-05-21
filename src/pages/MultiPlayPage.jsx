import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest, loadRoomSession } from "../lib/api.js";
import { useRoomState } from "../hooks/useRoomState.js";

const REVEAL_PAUSE_MS = 3500;

export default function MultiPlayPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const roomId = loadRoomSession(code);
  const { state, error, loading } = useRoomState(roomId);
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const room = state?.room;
  const question = state?.currentQuestion;
  const me = state?.players?.find((p) => p.user_id === user?.id);
  const isHost = room?.host_id === user?.id;

  const sortedPlayers = useMemo(
    () => [...(state?.players || [])].sort((a, b) => b.score - a.score),
    [state?.players]
  );

  useEffect(() => {
    setSelected([]);
  }, [room?.current_index, room?.status]);

  useEffect(() => {
    if (!room?.question_deadline_at || room.status !== "playing") {
      setSecondsLeft(0);
      return undefined;
    }

    function tick() {
      const left = Math.max(
        0,
        Math.ceil((new Date(room.question_deadline_at).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(left);
      if (left === 0 && !me?.has_answered) {
        apiRequest("/api/game/timeout", {
          method: "POST",
          body: { roomId },
        }).catch(() => {});
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [room?.question_deadline_at, room?.status, me?.has_answered, roomId]);

  useEffect(() => {
    if (!isHost || room?.status !== "revealing") return undefined;
    const timer = setTimeout(() => {
      apiRequest("/api/game/advance", {
        method: "POST",
        body: { roomId },
      }).catch(() => {});
    }, REVEAL_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [isHost, room?.status, room?.current_index, roomId]);

  function toggleOption(index) {
    if (!question || me?.has_answered || room?.status !== "playing") return;

    if (question.type === "single") {
      setSelected([index]);
      return;
    }

    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort()
    );
  }

  async function submitAnswer() {
    if (!selected.length || me?.has_answered) return;
    setSubmitting(true);
    try {
      await apiRequest("/api/game/answer", {
        method: "POST",
        body: { roomId, selected },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!roomId) {
    return (
      <main className="app">
        <section className="card intro">
          <p className="live-result wrong">Сессия комнаты потеряна.</p>
          <Link to="/multi/join">Войти снова</Link>
        </section>
      </main>
    );
  }

  if (room?.status === "finished") {
    const winner = sortedPlayers[0];
    return (
      <main className="app">
        <section className="card summary">
          <h1>Игра окончена</h1>
          <p>
            Победитель: <b>{winner?.username}</b> ({winner?.score} очков)
          </p>
          <ul className="review-options">
            {sortedPlayers.map((player) => (
              <li key={player.user_id}>
                {player.username}: {player.score} очков
                {player.last_points > 0 ? ` (+${player.last_points} за раунд)` : ""}
              </li>
            ))}
          </ul>
          <Link className="primary-btn" to="/">
            На главную
          </Link>
        </section>
      </main>
    );
  }

  if (room?.status === "waiting") {
    return (
      <main className="app">
        <section className="card intro">
          <p className="subtitle">Ожидание старта...</p>
          <Link to={`/multi/lobby/${code}`}>Вернуться в лобби</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="card quiz">
        <div className="top-row">
          <p className="counter">
            Вопрос {(room?.current_index ?? 0) + 1} / {room?.question_ids?.length || 20}
          </p>
          <p className="counter timer">⏱ {secondsLeft} с</p>
        </div>

        <div className="scoreboard">
          {sortedPlayers.map((player) => (
            <span key={player.user_id} className="chip">
              {player.username}: {player.score}
              {player.has_answered ? " ✓" : ""}
            </span>
          ))}
        </div>

        {loading && <p className="attempts">Загрузка...</p>}
        {error && <p className="live-result wrong">{error}</p>}

        {room?.status === "revealing" && state?.reveal && (
          <div className="reveal-box">
            <p className="live-result right">Правильный ответ:</p>
            <ul className="review-options">
              {state.reveal.correctOptions.map((text) => (
                <li key={text} className="state-right-selected">
                  {text}
                </li>
              ))}
            </ul>
            {sortedPlayers.map((player) => (
              <p key={player.user_id} className="attempts">
                {player.username}: {player.last_answer_correct ? "+" : ""}
                {player.last_points} очков
              </p>
            ))}
          </div>
        )}

        {room?.status === "playing" && question && (
          <>
            <h1>{question.text}</h1>
            <p className="type-tip">
              {question.type === "multiple" ? "Несколько вариантов" : "Один вариант"} — быстрее
              ответ = больше очков
            </p>
            <div className="options">
              {question.options.map((option, idx) => (
                <label
                  key={option}
                  className={selected.includes(idx) ? "option active" : "option"}
                >
                  <input
                    type={question.type === "multiple" ? "checkbox" : "radio"}
                    checked={selected.includes(idx)}
                    disabled={me?.has_answered}
                    onChange={() => toggleOption(idx)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <div className="actions">
              <button
                className="primary-btn"
                type="button"
                onClick={submitAnswer}
                disabled={!selected.length || me?.has_answered || submitting}
              >
                {me?.has_answered ? "Ответ отправлен" : submitting ? "Отправка..." : "Ответить"}
              </button>
            </div>
            {me?.has_answered && (
              <p className="attempts">Ждём ответа соперника или окончания таймера...</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
