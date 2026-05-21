import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest, saveRoomSession } from "../lib/api.js";

export default function MultiJoinPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) {
    return (
      <main className="app">
        <section className="card intro">
          <p className="subtitle">Войдите, чтобы войти в комнату.</p>
          <Link className="primary-btn intro-action-btn" to="/login">
            Войти
          </Link>
        </section>
      </main>
    );
  }

  async function handleJoin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { room } = await apiRequest("/api/rooms/join", {
        method: "POST",
        body: { code: code.trim().toUpperCase() },
      });
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
        <h1>Войти в комнату</h1>
        <form className="auth-form" onSubmit={handleJoin}>
          <label>
            Код комнаты
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              required
              maxLength={6}
            />
          </label>
          {error && <p className="live-result wrong">{error}</p>}
          <button className="primary-btn intro-action-btn" type="submit" disabled={loading}>
            {loading ? "Подключение..." : "Войти"}
          </button>
        </form>
        <Link className="ghost-btn intro-action-btn" to="/">
          Назад
        </Link>
      </section>
    </main>
  );
}
