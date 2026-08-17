import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthGate from "../components/AuthGate.jsx";
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
  const [params] = useSearchParams();
  const quizFromUrl = params.get("quiz");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [quizzes, setQuizzes] = useState([]);
  const [quizId, setQuizId] = useState(quizFromUrl || "");
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_ROOM_SETTINGS });

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function load() {
      try {
        const data = await apiRequest("/api/quizzes");
        if (cancelled) return;
        const published = (data.quizzes || []).filter(
          (quiz) => quiz.status === "published" && quiz.questionCount > 0
        );
        setQuizzes(published);
        const initialId = quizFromUrl || published[0]?.id || "";
        setQuizId(initialId);
        setSelectedQuiz(published.find((quiz) => quiz.id === initialId) || null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, quizFromUrl]);

  useEffect(() => {
    const quiz = quizzes.find((item) => item.id === quizId);
    setSelectedQuiz(quiz || null);
    if (quiz) {
      setSettings((prev) => ({
        ...prev,
        questionCount: Math.min(prev.questionCount, quiz.questionCount),
      }));
    }
  }, [quizId, quizzes]);

  if (!user) {
    return <AuthGate message="Войдите, чтобы создать состязание." />;
  }

  async function handleCreate() {
    if (!quizId) {
      setError("Сначала опубликуйте тест в кабинете");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { room } = await apiRequest("/api/rooms/create", {
        method: "POST",
        body: {
          quizId,
          settings: normalizeRoomSettings(settings),
        },
      });
      saveRoomSession(room.code, room.id);
      navigate(`/multi/lobby/${room.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!quizzes.length) {
    return (
      <PageLayout className="intro">
        <h1>Создать комнату</h1>
        <p className="subtitle">
          Нужен опубликованный тест с хотя бы одним вопросом.
        </p>
        {error && <p className="live-result wrong">{error}</p>}
        <div className="stack stack-center">
          <Button variant="primary" to="/me/quizzes" block>
            К тестам
          </Button>
          <Button variant="secondary" to="/" block>
            Назад
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="intro page-centered">
      <h1>Создать комнату</h1>
      <p className="subtitle">Выберите тест и настройки дуэли — изменить можно в лобби.</p>
      {error && <p className="live-result wrong">{error}</p>}

      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Тест
          <select value={quizId} onChange={(e) => setQuizId(e.target.value)}>
            {quizzes.map((quiz) => (
              <option key={quiz.id} value={quiz.id}>
                {quiz.title} ({quiz.questionCount})
              </option>
            ))}
          </select>
        </label>
      </form>

      <RoomSettingsForm
        settings={settings}
        maxQuestions={selectedQuiz?.questionCount}
        onChange={setSettings}
        onPreset={(preset) => {
          const { label, ...rest } = preset;
          const next = { ...DEFAULT_ROOM_SETTINGS, ...rest };
          if (selectedQuiz) {
            next.questionCount = Math.min(next.questionCount, selectedQuiz.questionCount);
          }
          setSettings(next);
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
