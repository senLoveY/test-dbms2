import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AuthGate from "../components/AuthGate.jsx";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest } from "../lib/api.js";

export default function QuizReviewPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return undefined;
    let cancelled = false;

    async function load() {
      try {
        const data = await apiRequest(`/api/quizzes/${id}`);
        if (!cancelled) setQuiz(data.quiz);
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
  }, [user, id]);

  if (authLoading || loading) {
    return (
      <PageLayout className="intro">
        <p className="muted">Загрузка...</p>
      </PageLayout>
    );
  }

  if (!user) {
    return <AuthGate message="Войдите, чтобы открыть справочник своего теста." />;
  }

  if (error || !quiz) {
    return (
      <PageLayout className="intro">
        <p className="live-result wrong">{error || "Тест не найден"}</p>
        <Button variant="primary" to="/me/quizzes" block>
          К тестам
        </Button>
      </PageLayout>
    );
  }

  return (
    <main className="app app-wide">
      <section className="card page-centered">
        <p className="chip">Справочник</p>
        <h1>{quiz.title}</h1>
        <p className="subtitle">Правильные ответы только для автора теста.</p>
        <div className="stack stack-center">
          <Button variant="primary" to={`/q/${quiz.id}/study`} block>
            Соло
          </Button>
          <Button variant="secondary" to={`/me/quizzes/${quiz.id}/edit`} block>
            Редактор
          </Button>
          <Button variant="secondary" to="/me/quizzes" block>
            К тестам
          </Button>
        </div>
      </section>

      <section className="card review">
        <div className="review-list">
          {(quiz.questions || []).map((question, index) => (
            <article className="review-item" key={question.id || index}>
              <div className="review-header">
                <h3>
                  {index + 1}. {question.text}
                </h3>
                <span className="badge right">
                  {question.type === "multiple" ? "Несколько" : "Один"}
                </span>
              </div>
              <ul className="review-options">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = question.correct.includes(optionIndex);
                  return (
                    <li
                      key={`${question.id}-${optionIndex}`}
                      className={isCorrect ? "state-right-selected" : "state-neutral"}
                    >
                      {option}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
