import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout, { PageHeader } from "../components/PageLayout.jsx";
import RoomSettingsForm, { DEFAULT_ROOM_SETTINGS } from "../components/RoomSettingsForm.jsx";
import { SkeletonLines } from "../components/Skeleton.jsx";
import { normalizeRoomSettings } from "../../lib/roomSettings.js";
import { apiRequest, saveRoomSession } from "../lib/api.js";
import { formatQuestions } from "../lib/format.js";
import { useQuizzes } from "../lib/quizStore.js";

export default function MultiCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { quizzes, loading: quizzesLoading } = useQuizzes();
  const [quizId, setQuizId] = useState(params.get("quiz") || "");
  const [settings, setSettings] = useState({ ...DEFAULT_ROOM_SETTINGS });
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const published = quizzes.filter((quiz) => quiz.status === "published" && quiz.questionCount > 0);
  const selected = published.find((quiz) => quiz.id === quizId) || null;

  useEffect(() => {
    if (!selected && published[0]) setQuizId(published[0].id);
  }, [selected, published]);

  useEffect(() => {
    if (!selected) return;
    setSettings((prev) => ({
      ...prev,
      questionCount: Math.min(prev.questionCount, selected.questionCount),
    }));
  }, [selected]);

  async function handleCreate() {
    if (!selected) return;
    setError("");
    setCreating(true);
    try {
      const { room } = await apiRequest("/api/rooms/create", {
        method: "POST",
        body: { quizId: selected.id, settings: normalizeRoomSettings(settings) },
      });
      saveRoomSession(room.code, room.id);
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  if (quizzesLoading) {
    return (
      <PageLayout>
        <PageHeader eyebrow="Дуэль" title="Новая комната" />
        <SkeletonLines rows={3} />
      </PageLayout>
    );
  }

  if (!published.length) {
    return (
      <PageLayout width="narrow">
        <PageHeader
          eyebrow="Дуэль"
          title="Нужен опубликованный тест"
          lead="Дуэль играется на вашем тесте. Опубликуйте хотя бы один — и возвращайтесь."
        />
        <div className="row">
          <Button variant="primary" to="/me/quizzes">
            К моим тестам
          </Button>
          <Button variant="ghost" to="/multi/join">
            У меня есть код →
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Дуэль"
        title="Новая комната"
        lead="Выберите тест и правила. Настройки можно поменять в лобби, пока ждёте соперника."
      />

      <div className="create-grid">
        <section>
          <h2 className="section-title">Тест</h2>
          <div className="choice-list" role="radiogroup" aria-label="Тест для дуэли">
            {published.map((quiz) => (
              <button
                type="button"
                role="radio"
                aria-checked={quiz.id === quizId}
                key={quiz.id}
                className={`choice ${quiz.id === quizId ? "is-active" : ""}`}
                onClick={() => setQuizId(quiz.id)}
              >
                <span className="choice-radio" aria-hidden="true" />
                <span className="choice-body">
                  <span className="choice-title">{quiz.title}</span>
                  <span className="choice-meta">{formatQuestions(quiz.questionCount)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title">Правила</h2>
          <RoomSettingsForm
            settings={settings}
            maxQuestions={selected?.questionCount}
            onChange={setSettings}
          />
        </section>
      </div>

      {error && <p className="notice notice-bad">{error}</p>}
      <div className="sticky-actions">
        <Button variant="accent" size="lg" onClick={handleCreate} loading={creating} disabled={!selected}>
          Создать комнату
        </Button>
      </div>
    </PageLayout>
  );
}
