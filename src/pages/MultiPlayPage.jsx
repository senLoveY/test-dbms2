import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import PlayerAnswers from "../components/PlayerAnswers.jsx";
import VictoryScreen from "../components/VictoryScreen.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import {
  apiRequest,
  clearRoomSession,
  loadRoomSession,
} from "../lib/api.js";
import { useRoomState } from "../hooks/useRoomState.js";

export default function MultiPlayPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roomId = loadRoomSession(code);
  const { state, error, loading, refresh } = useRoomState(roomId);
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const selectedRef = useRef([]);
  const timerHandledRef = useRef(false);

  const room = state?.room;
  const question = state?.currentQuestion;
  const me = state?.players?.find((p) => p.user_id === user?.id);
  const isHost = room?.host_id === user?.id;
  const showPlayerAnswers = state?.showPlayerAnswers;
  const settings = state?.settings;
  const revealPauseMs = settings?.revealPauseMs ?? 3500;
  const autoSubmitOnTimeout = settings?.autoSubmitOnTimeout ?? true;
  const questionTotal =
    room?.question_ids?.length || settings?.questionCount || 20;

  const sortedPlayers = useMemo(
    () => [...(state?.players || [])].sort((a, b) => b.score - a.score),
    [state?.players]
  );

  useEffect(() => {
    setSelected([]);
    timerHandledRef.current = false;
  }, [room?.current_index, room?.status]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!room?.question_deadline_at || room.status !== "playing") {
      setSecondsLeft(0);
      return undefined;
    }

    async function onTimerEnd() {
      if (timerHandledRef.current || me?.has_answered) return;
      timerHandledRef.current = true;

      const pending = selectedRef.current;
      try {
        if (pending.length > 0 && autoSubmitOnTimeout) {
          await apiRequest("/api/game/answer", {
            method: "POST",
            body: { roomId, selected: pending },
          });
        } else {
          await apiRequest("/api/game/timeout", {
            method: "POST",
            body: { roomId },
          });
        }
        await refresh();
      } catch (err) {
        console.error(err);
        timerHandledRef.current = false;
      }
    }

    function tick() {
      const left = Math.max(
        0,
        Math.ceil((new Date(room.question_deadline_at).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(left);
      if (left === 0) {
        onTimerEnd();
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [
    room?.question_deadline_at,
    room?.status,
    me?.has_answered,
    roomId,
    refresh,
    autoSubmitOnTimeout,
  ]);

  useEffect(() => {
    if (!isHost || room?.status !== "revealing") return undefined;
    const timer = setTimeout(() => {
      apiRequest("/api/game/advance", {
        method: "POST",
        body: { roomId },
      })
        .then(() => refresh())
        .catch(() => {});
    }, revealPauseMs);
    return () => clearTimeout(timer);
  }, [isHost, room?.status, room?.current_index, roomId, refresh, revealPauseMs]);

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
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeave() {
    if (
      !window.confirm(
        "Выйти из комнаты? Игра для оставшегося игрока будет завершена."
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      await apiRequest("/api/rooms/leave", {
        method: "POST",
        body: { roomId },
      });
      clearRoomSession(code);
      navigate("/");
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEndGame() {
    if (!window.confirm("Завершить игру для всех участников?")) return;
    setActionLoading(true);
    try {
      await apiRequest("/api/game/end", {
        method: "POST",
        body: { roomId },
      });
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }

  if (!roomId) {
    return (
      <PageLayout className="intro">
        <p className="live-result wrong">Сессия комнаты потеряна.</p>
        <Button variant="primary" to="/multi/join" block>
          Войти снова
        </Button>
      </PageLayout>
    );
  }

  if (room?.status === "finished") {
    const soloFinish = sortedPlayers.length <= 1;
    const youWon =
      sortedPlayers[0]?.user_id === user?.id &&
      !soloFinish &&
      sortedPlayers.length >= 2;

    return (
      <VictoryScreen
        title={youWon ? "Победа!" : "Игра окончена"}
        subtitle={
          soloFinish
            ? "Противник вышел или игра завершена досрочно."
            : youWon
              ? "Вы набрали больше всех очков."
              : "В следующий раз повезёт больше!"
        }
        players={sortedPlayers}
        currentUserId={user?.id}
        soloFinish={soloFinish}
        onHome={() => {
          clearRoomSession(code);
          navigate("/");
        }}
      />
    );
  }

  if (room?.status === "waiting") {
    return (
      <PageLayout className="intro">
        <p className="subtitle">Ожидание старта...</p>
        <Button variant="secondary" to={`/multi/lobby/${code}`} block>
          Вернуться в лобби
        </Button>
      </PageLayout>
    );
  }

  return (
    <main className="app">
      <section className="card quiz">
        <div className="top-row">
          <p className="counter">
            Вопрос {(room?.current_index ?? 0) + 1} / {questionTotal}
          </p>
          <p className="timer">⏱ {secondsLeft} с</p>
        </div>

        <div className="scoreboard">
          {sortedPlayers.map((player) => (
            <span key={player.user_id} className="score-pill">
              {player.username}: {player.score}
              {player.has_answered ? " ✓" : ""}
            </span>
          ))}
        </div>

        {loading && <p className="muted">Загрузка...</p>}
        {error && <p className="live-result wrong">{error}</p>}

        {room?.status === "revealing" && state?.reveal && (
          <div className="reveal-box">
            <p className="live-result right">Правильный ответ</p>
            <ul className="review-options">
              {state.reveal.correctOptions.map((text) => (
                <li key={text} className="state-right-selected">
                  {text}
                </li>
              ))}
            </ul>
            {showPlayerAnswers && (
              <PlayerAnswers players={sortedPlayers} title="Ответы игроков" />
            )}
          </div>
        )}

        {room?.status === "playing" && showPlayerAnswers && (
          <PlayerAnswers players={sortedPlayers} title="Оба ответили" />
        )}

        {room?.status === "playing" && question && (
          <>
            <h1>{question.text}</h1>
            <p className="type-tip">
              {question.type === "multiple" ? "Несколько вариантов" : "Один вариант"} — быстрее
              ответ, больше очков
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
              <Button
                variant="primary"
                onClick={submitAnswer}
                disabled={!selected.length || me?.has_answered || submitting}
              >
                {me?.has_answered ? "Ответ отправлен" : submitting ? "Отправка..." : "Ответить"}
              </Button>
            </div>
            {me?.has_answered && !showPlayerAnswers && (
              <p className="muted">Ждём соперника или окончания таймера…</p>
            )}
            {!me?.has_answered && selected.length > 0 && autoSubmitOnTimeout && (
              <p className="muted">При окончании таймера выбранные варианты отправятся автоматически.</p>
            )}
          </>
        )}

        <div className="stack game-actions">
          <Button variant="danger" block onClick={handleLeave} disabled={actionLoading}>
            Выйти из комнаты
          </Button>
          {isHost && (
            <Button variant="secondary" block onClick={handleEndGame} disabled={actionLoading}>
              Завершить игру
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
