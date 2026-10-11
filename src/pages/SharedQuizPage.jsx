import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { apiRequest, saveRoomSession } from "../lib/api.js";
import { formatQuestions } from "../lib/format.js";
import { reloadQuizzes } from "../lib/quizStore.js";
import { quizShareUrl, shareLink } from "../lib/share.js";

/** Landing page for a quiz shared by link: play solo, start a duel or keep a copy. */
export default function SharedQuizPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/api/quizzes/${id}/info`)
      .then((data) => !cancelled && setQuiz(data.quiz))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function startDuel() {
    setBusy("duel");
    try {
      const { room } = await apiRequest("/api/rooms/create", { method: "POST", body: { quizId: id } });
      saveRoomSession(room.code, room.id);
      navigate(`/room/${room.code}`);
    } catch (err) {
      toast(err.message, { tone: "bad" });
      setBusy("");
    }
  }

  async function saveCopy() {
    setBusy("copy");
    try {
      const { quiz: copy } = await apiRequest(`/api/quizzes/${id}/duplicate`, { method: "POST" });
      reloadQuizzes();
      toast("Тест сохранён в «Мои тесты»", {
        action: { label: "Открыть", onClick: () => navigate(`/me/quizzes/${copy.id}/edit`) },
      });
    } catch (err) {
      toast(err.message, { tone: "bad" });
    } finally {
      setBusy("");
    }
  }

  async function share() {
    try {
      const result = await shareLink({ title: quiz.title, text: `Тест «${quiz.title}»`, url: quizShareUrl(id) });
      if (result === "copied") toast("Ссылка скопирована");
    } catch {
      toast("Не получилось поделиться", { tone: "bad" });
    }
  }

  if (error) {
    return (
      <PageLayout width="narrow">
        <p className="eyebrow">Тест по ссылке</p>
        <h1 className="page-title">Тест недоступен</h1>
        <p className="lead">{error}</p>
        <div className="row">
          <Button variant="primary" to="/">
            На главную
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (!quiz) return <PageSkeleton />;

  const shared = quiz.visibility === "unlisted" && quiz.status === "published";

  return (
    <PageLayout width="narrow" className="shared">
      <p className="eyebrow">
        {quiz.isOwner ? "Ваш тест" : <>Тест от <span className="eyebrow-name">{quiz.author || "автора"}</span></>}
      </p>
      <h1 className="page-title">{quiz.title}</h1>
      {quiz.description && <p className="lead">{quiz.description}</p>}

      <dl className="facts">
        <div>
          <dt>Вопросов</dt>
          <dd>{quiz.questionCount}</dd>
        </div>
        <div>
          <dt>Теги</dt>
          <dd className="facts-text">{quiz.tags.length ? quiz.tags.map((tag) => `#${tag}`).join(" ") : "—"}</dd>
        </div>
      </dl>

      {quiz.isOwner && !shared && (
        <p className="notice notice-warn">
          Ссылка пока не работает для других: откройте доступ в «Мои тесты» → «Поделиться».
        </p>
      )}

      <div className="row">
        <Button variant="primary" size="lg" to={`/q/${id}/study`} disabled={!quiz.questionCount}>
          Пройти тест
        </Button>
        <Button
          variant="accent"
          size="lg"
          onClick={startDuel}
          loading={busy === "duel"}
          disabled={quiz.status !== "published"}
        >
          Вызвать на дуэль
        </Button>
      </div>
      <div className="row row-tight shared-extra">
        {!quiz.isOwner && (
          <Button variant="ghost" onClick={saveCopy} loading={busy === "copy"}>
            Сохранить себе
          </Button>
        )}
        {shared && (
          <Button variant="ghost" onClick={share}>
            Поделиться
          </Button>
        )}
      </div>
      <p className="muted small shared-note">
        {formatQuestions(quiz.questionCount)} · проверка сразу после ответа · прогресс сохраняется у вас
      </p>
    </PageLayout>
  );
}
