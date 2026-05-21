import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
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
      <PageLayout className="intro">
        <p className="subtitle">Войдите, чтобы войти в комнату.</p>
        <Button variant="primary" to="/login" block>
          Войти
        </Button>
      </PageLayout>
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
    <PageLayout className="intro">
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
        <Button variant="primary" type="submit" block disabled={loading}>
          {loading ? "Подключение..." : "Войти в комнату"}
        </Button>
      </form>
      <div className="stack stack-center">
        <Button variant="secondary" to="/" block>
          Назад
        </Button>
      </div>
    </PageLayout>
  );
}
