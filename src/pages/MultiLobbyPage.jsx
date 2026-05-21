import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest, loadRoomSession } from "../lib/api.js";
import { useRoomState } from "../hooks/useRoomState.js";

export default function MultiLobbyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roomId = loadRoomSession(code);
  const { state, error, loading } = useRoomState(roomId);

  const isHost = state?.room?.host_id === user?.id;
  const players = state?.players || [];

  useEffect(() => {
    if (state?.room?.status === "playing" || state?.room?.status === "revealing") {
      navigate(`/multi/play/${code}`);
    }
    if (state?.room?.status === "finished") {
      navigate(`/multi/play/${code}`);
    }
  }, [state?.room?.status, code, navigate]);

  async function handleStart() {
    await apiRequest("/api/game/start", {
      method: "POST",
      body: { roomId },
    });
  }

  if (!roomId) {
    return (
      <main className="app">
        <section className="card intro">
          <p className="live-result wrong">Комната не найдена. Войдите по коду снова.</p>
          <Link className="primary-btn intro-action-btn" to="/multi/join">
            Войти в комнату
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="card intro">
        <h1>Лобби</h1>
        <p className="subtitle">
          Код комнаты: <b>{code}</b>
        </p>
        {loading && <p className="attempts">Загрузка...</p>}
        {error && <p className="live-result wrong">{error}</p>}

        <ul className="review-options lobby-players">
          {players.map((player) => (
            <li key={player.user_id}>
              {player.username} — {player.score} очков
              {state?.room?.host_id === player.user_id ? " (хост)" : ""}
            </li>
          ))}
        </ul>

        <p className="attempts">Игроков: {players.length} / 2</p>

        <div className="intro-actions">
          {isHost && (
            <button
              className="primary-btn intro-action-btn"
              type="button"
              onClick={handleStart}
              disabled={players.length < 2}
            >
              Начать игру
            </button>
          )}
          <Link className="ghost-btn intro-action-btn" to="/">
            На главную
          </Link>
        </div>
      </section>
    </main>
  );
}
