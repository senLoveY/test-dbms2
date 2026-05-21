import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest, clearRoomSession, loadRoomSession } from "../lib/api.js";
import { useRoomState } from "../hooks/useRoomState.js";

export default function MultiLobbyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roomId = loadRoomSession(code);
  const { state, error, loading, refresh } = useRoomState(roomId);

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
    await refresh();
  }

  async function handleLeave() {
    if (!window.confirm("Выйти из комнаты?")) return;
    try {
      await apiRequest("/api/rooms/leave", {
        method: "POST",
        body: { roomId },
      });
      clearRoomSession(code);
      navigate("/");
    } catch (err) {
      console.error(err);
    }
  }

  if (!roomId) {
    return (
      <PageLayout className="intro">
        <p className="live-result wrong">Комната не найдена. Войдите по коду снова.</p>
        <Button variant="primary" to="/multi/join" block>
          Войти в комнату
        </Button>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="intro">
      <p className="chip">Лобби</p>
      <h1>Ожидание игроков</h1>
      <p className="subtitle">Передайте код другу:</p>
      <p className="code-display">{code}</p>

      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="live-result wrong">{error}</p>}

      <ul className="player-list">
        {players.map((player) => (
          <li className="player-card" key={player.user_id}>
            <strong>{player.username}</strong>
            <span>
              {state?.room?.host_id === player.user_id && (
                <span className="host-badge">Хост</span>
              )}
              {state?.room?.host_id !== player.user_id && (
                <span className="muted">{player.score} очков</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="muted">Игроков: {players.length} / 2</p>

      <div className="stack stack-center">
        {isHost && (
          <Button
            variant="primary"
            block
            onClick={handleStart}
            disabled={players.length < 2}
          >
            Начать игру
          </Button>
        )}
        <Button variant="danger" block onClick={handleLeave}>
          Выйти из комнаты
        </Button>
        <Button variant="secondary" to="/" block>
          На главную
        </Button>
      </div>
    </PageLayout>
  );
}
