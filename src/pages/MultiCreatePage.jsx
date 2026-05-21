import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest, saveRoomSession } from "../lib/api.js";

export default function MultiCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) {
    return (
      <PageLayout className="intro">
        <p className="subtitle">Войдите, чтобы создать комнату.</p>
        <Button variant="primary" to="/login" block>
          Войти
        </Button>
      </PageLayout>
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
    <PageLayout className="intro">
      <h1>Создать комнату</h1>
      <p className="subtitle">Дуэль на 2 игроков. Поделитесь кодом с другом.</p>
      {error && <p className="live-result wrong">{error}</p>}
      <div className="stack stack-center">
        <Button variant="primary" block onClick={handleCreate} disabled={loading}>
          {loading ? "Создание..." : "Создать комнату"}
        </Button>
        <Button variant="secondary" to="/" block>
          Назад
        </Button>
      </div>
    </PageLayout>
  );
}
