import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthGate from "../components/AuthGate.jsx";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest } from "../lib/api.js";

export default function QuizListPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiRequest("/api/quizzes");
        if (!cancelled) setQuizzes(data.quizzes || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) {
    return (
      <PageLayout className="intro">
        <p className="muted">Загрузка...</p>
      </PageLayout>
    );
  }

  if (!user) {
    return <AuthGate message="Войдите, чтобы управлять своими тестами." />;
  }

  async function handleCreate() {
    setBusyId("create");
    setError("");
    try {
      const { quiz } = await apiRequest("/api/quizzes", {
        method: "POST",
        body: { title: "Новый тест" },
      });
      navigate(`/me/quizzes/${quiz.id}/edit`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleDuplicate(id) {
    setBusyId(id);
    try {
      const { quiz } = await apiRequest(`/api/quizzes/${id}/duplicate`, {
        method: "POST",
      });
      setQuizzes((prev) => [quiz, ...prev]);
      navigate(`/me/quizzes/${quiz.id}/edit`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Удалить тест? Это нельзя отменить.")) return;
    setBusyId(id);
    try {
      await apiRequest(`/api/quizzes/${id}`, { method: "DELETE" });
      setQuizzes((prev) => prev.filter((quiz) => quiz.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <PageLayout className="quiz-cabinet" wide centered={false}>
      <header className="cabinet-header">
        <div>
          <p className="chip">Кабинет</p>
          <h1>Мои тесты</h1>
          <p className="subtitle">
            Создайте набор вопросов, готовьтесь в соло и вызывайте друга на дуэль.
          </p>
        </div>
        <Button variant="primary" onClick={handleCreate} disabled={busyId === "create"}>
          {busyId === "create" ? "Создание..." : "Новый тест"}
        </Button>
      </header>

      {error && <p className="live-result wrong">{error}</p>}
      {loading && <p className="muted">Загрузка...</p>}

      {!loading && quizzes.length === 0 && (
        <section className="empty-state">
          <h2>Пока пусто</h2>
          <p className="muted">Соберите первый тест — и сразу можно готовиться или играть.</p>
        </section>
      )}

      <div className="quiz-grid">
        {quizzes.map((quiz) => (
          <article className="quiz-card" key={quiz.id}>
            <div className="quiz-card-top">
              <h2>{quiz.title}</h2>
              <span className={`status-badge status-${quiz.status}`}>
                {quiz.status === "published" ? "Опубликован" : "Черновик"}
              </span>
            </div>
            {quiz.description && <p>{quiz.description}</p>}
            <p className="muted">
              {quiz.questionCount} вопр.
              {quiz.tags?.length ? ` · ${quiz.tags.join(", ")}` : ""}
            </p>
            <div className="quiz-card-actions">
              <Button variant="primary" to={`/q/${quiz.id}/study`}>
                Соло
              </Button>
              <Button
                variant="accent"
                to={
                  quiz.status === "published" && quiz.questionCount > 0
                    ? `/multi/create?quiz=${quiz.id}`
                    : undefined
                }
                disabled={quiz.status !== "published" || quiz.questionCount < 1}
              >
                Дуэль
              </Button>
              <Button variant="secondary" to={`/me/quizzes/${quiz.id}/edit`}>
                Править
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDuplicate(quiz.id)}
                disabled={busyId === quiz.id}
              >
                Копия
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(quiz.id)}
                disabled={busyId === quiz.id}
              >
                Удалить
              </Button>
            </div>
          </article>
        ))}
      </div>

      <div className="stack" style={{ maxWidth: 360, marginTop: 28 }}>
        <Button variant="secondary" to="/" block>
          На главную
        </Button>
      </div>
    </PageLayout>
  );
}
