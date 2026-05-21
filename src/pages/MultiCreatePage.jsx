import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import RoomSettingsForm, {
  DEFAULT_ROOM_SETTINGS,
} from "../components/RoomSettingsForm.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { normalizeRoomSettings } from "../../lib/roomSettings.js";
import { apiRequest, saveRoomSession } from "../lib/api.js";

export default function MultiCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({ ...DEFAULT_ROOM_SETTINGS });

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
      const { room } = await apiRequest("/api/rooms/create", {
        method: "POST",
        body: { settings: normalizeRoomSettings(settings) },
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
    <PageLayout className="intro page-centered">
      <h1>Создать комнату</h1>
      <p className="subtitle">Настройте дуэль — изменить можно в лобби до старта.</p>
      {error && <p className="live-result wrong">{error}</p>}

      <RoomSettingsForm
        settings={settings}
        onChange={setSettings}
        onPreset={(preset) => {
          const { label, ...rest } = preset;
          setSettings({ ...DEFAULT_ROOM_SETTINGS, ...rest });
        }}
      />

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
