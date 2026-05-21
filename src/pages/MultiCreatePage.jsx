import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest, saveRoomSession } from "../lib/api.js";

export default function MultiCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) {
    return (
      <main className="app">
        <section className="card intro">
          <p className="subtitle">Войдите, чтобы создать комнату.</p>
          <Link className="primary-btn intro-action-btn" to="/login">
            Войти
          </Link>
        </section>
      </main>
    );
  }

  async function handleCreate() {
    setError("");
    setLoading(true);
    try {
      const { room } = await apiRequest("/api/rooms/create", { method: "POST" });
      saveRoomSession(room.code, room.id);
      navigate(`/multi/lobby/${room.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <section className="card intro">
        <h1>Создать комнату</h1>
        <p className="subtitle">Дуэль на 2 игроков. Поделитесь кодом с другом.</p>
        {error && <p className="live-result wrong">{error}</p>}
        <div className="intro-actions">
          <button
            className="primary-btn intro-action-btn"
            type="button"
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? "Создание..." : "Создать комнату"}
          </button>
          <Link className="ghost-btn intro-action-btn" to="/">
            Назад
          </Link>
        </div>
      </section>
    </main>
  );
}
