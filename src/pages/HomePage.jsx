import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { SkeletonLines } from "../components/Skeleton.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { formatQuestions } from "../lib/format.js";
import { prefetchQuiz, useQuizzes } from "../lib/quizStore.js";

const STEPS = [
  {
    title: "Соберите тест",
    text: "Вручную, из JSON или из конспекта — модель подготовит черновик вопросов.",
  },
  {
    title: "Готовьтесь в соло",
    text: "Проверка сразу после ответа, разбор ошибок и повтор только неверных.",
  },
  {
    title: "Вызовите на дуэль",
    text: "Комната по коду, общий таймер и очки за скорость. Один тест — два игрока.",
  },
];

function Landing({ isConfigured }) {
  return (
    <PageLayout className="home">
      <section className="hero">
        <h1 className="display">
          Тесты, которые
          <br />
          хочется <em>проходить.</em>
        </h1>
        <p className="lead hero-lead">
          Соберите свои вопросы, готовьтесь к контрольной в своём темпе или позовите друга на
          дуэль с таймером.
        </p>
        <div className="row">
          <Button variant="primary" size="lg" to="/register">
            Начать бесплатно
          </Button>
          <Button variant="ghost" size="lg" to="/login">
            У меня есть аккаунт →
          </Button>
        </div>
        {!isConfigured && (
          <p className="notice notice-bad">
            Supabase не настроен. Добавьте переменные из <code>.env.example</code>.
          </p>
        )}
      </section>

      <ol className="steps">
        {STEPS.map((step, index) => (
          <li className="step" key={step.title} style={{ "--i": index }}>
            <span className="step-num">{String(index + 1).padStart(2, "0")}</span>
            <h2 className="step-title">{step.title}</h2>
            <p className="step-text">{step.text}</p>
          </li>
        ))}
      </ol>
    </PageLayout>
  );
}

function Dashboard({ name }) {
  const { quizzes, loading } = useQuizzes();
  const recent = quizzes.slice(0, 5);

  return (
    <PageLayout className="home">
      <section className="hero hero-compact">
        <p className="eyebrow">Привет, {name}</p>
        <h1 className="display display-sm">Что делаем сегодня?</h1>
        <div className="row">
          <Button variant="primary" to="/me/quizzes?new=1">
            Новый тест
          </Button>
          <Button variant="accent" to="/multi/create">
            Создать дуэль
          </Button>
          <Button variant="ghost" to="/multi/join">
            Войти по коду →
          </Button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Недавние тесты</h2>
          {quizzes.length > 0 && (
            <Link to="/me/quizzes" className="link-quiet">
              Все тесты →
            </Link>
          )}
        </div>

        {loading && <SkeletonLines rows={3} />}

        {!loading && recent.length === 0 && (
          <div className="empty">
            <p className="empty-title">Пока ни одного теста</p>
            <p className="muted">Начните с пустого или вставьте конспект — вопросы соберутся сами.</p>
            <Button variant="primary" to="/me/quizzes?new=1">
              Создать первый тест
            </Button>
          </div>
        )}

        {recent.length > 0 && (
          <ol className="rows">
            {recent.map((quiz, index) => {
              const playable = quiz.status === "published" && quiz.questionCount > 0;
              return (
                <li
                  className="row-item"
                  key={quiz.id}
                  style={{ "--i": index }}
                  onPointerEnter={() => prefetchQuiz(quiz.id)}
                >
                  <span className="row-num">{String(index + 1).padStart(2, "0")}</span>
                  <div className="row-main">
                    <Link to={`/me/quizzes/${quiz.id}/edit`} className="row-title">
                      {quiz.title}
                    </Link>
                    <p className="row-meta">
                      {formatQuestions(quiz.questionCount)}
                      <span className={`status status-${quiz.status}`}>
                        {quiz.status === "published" ? "опубликован" : "черновик"}
                      </span>
                    </p>
                  </div>
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      to={`/q/${quiz.id}/study`}
                      disabled={!quiz.questionCount}
                    >
                      Соло
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      to={`/multi/create?quiz=${quiz.id}`}
                      disabled={!playable}
                      title={playable ? undefined : "Сначала опубликуйте тест"}
                    >
                      Дуэль
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </PageLayout>
  );
}

export default function HomePage() {
  const { user, profile, loading, isConfigured } = useAuth();

  if (loading) return <PageLayout className="home" />;
  if (!user) return <Landing isConfigured={isConfigured} />;
  return <Dashboard name={profile?.username || user.email?.split("@")[0]} />;
}
