import { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest } from "../lib/api.js";

export default function HomePage() {
  const { user, profile, signOut, isConfigured } = useAuth();
  const displayName = profile?.username || user?.email?.split("@")[0];
  const [quizzes, setQuizzes] = useState([]);

  useEffect(() => {
    if (!user) {
      setQuizzes([]);
      return undefined;
    }
    let cancelled = false;
    apiRequest("/api/quizzes")
      .then((data) => {
        if (!cancelled) setQuizzes((data.quizzes || []).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setQuizzes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <main className="app home-page">
      <div className="home-bg" aria-hidden="true">
        <span className="home-orb home-orb-a" />
        <span className="home-orb home-orb-b" />
        <span className="home-grid" />
      </div>

      <header className="home-hero">
        <p className="chip home-chip">Платформа</p>
        <h1 className="home-title">
          Тесты и
          <span className="home-title-accent"> состязания</span>
        </h1>
        <p className="home-lead">
          Соберите свой набор вопросов, готовьтесь к контрольной или вызовите друга
          на дуэль с таймером и очками.
        </p>

        {user && (
          <div className="home-user-pill">
            <span className="home-user-avatar">{displayName?.[0]?.toUpperCase() || "?"}</span>
            <span>
              Привет, <strong>{displayName}</strong>
            </span>
          </div>
        )}

        {!isConfigured && (
          <p className="live-result wrong home-alert">
            Supabase не настроен. Добавьте переменные из `.env.example`.
          </p>
        )}
      </header>

      <section className="home-features" aria-label="Действия">
        <article className="home-feature-card home-feature-solo">
          <span className="home-feature-icon" aria-hidden="true">
            📘
          </span>
          <h2>Мои тесты</h2>
          <p>Создавайте, редактируйте и готовьтесь по своим вопросам.</p>
          <div className="home-feature-actions">
            <Button variant="primary" to={user ? "/me/quizzes" : "/login"}>
              {user ? "Кабинет" : "Войти"}
            </Button>
            {user && (
              <Button variant="secondary" to="/me/quizzes">
                Создать
              </Button>
            )}
          </div>
        </article>

        <article className="home-feature-card home-feature-duel">
          <span className="home-feature-icon" aria-hidden="true">
            ⚔️
          </span>
          <h2>Состязание</h2>
          <p>Дуэль на выбранном тесте: таймер, очки за скорость, разбор раунда.</p>
          <div className="home-feature-actions">
            {user ? (
              <>
                <Button variant="primary" to="/multi/create">
                  Создать
                </Button>
                <Button variant="secondary" to="/multi/join">
                  Войти
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" to="/login">
                  Войти
                </Button>
                <Button variant="secondary" to="/register">
                  Регистрация
                </Button>
              </>
            )}
          </div>
        </article>

        <article className="home-feature-card home-feature-answers">
          <span className="home-feature-icon" aria-hidden="true">
            ✓
          </span>
          <h2>Подготовка</h2>
          <p>Соло с мгновенной проверкой и справочник правильных ответов вашего теста.</p>
          <Button variant="secondary" to={user ? "/me/quizzes" : "/register"}>
            {user ? "Открыть тесты" : "Начать"}
          </Button>
        </article>
      </section>

      {user && quizzes.length > 0 && (
        <section className="home-recent">
          <h2>Недавние тесты</h2>
          <div className="home-recent-list">
            {quizzes.map((quiz) => (
              <article className="home-recent-card" key={quiz.id}>
                <div>
                  <strong>{quiz.title}</strong>
                  <p className="muted">
                    {quiz.questionCount} вопр. ·{" "}
                    {quiz.status === "published" ? "опубликован" : "черновик"}
                  </p>
                </div>
                <Button variant="secondary" to={`/q/${quiz.id}/study`}>
                  Соло
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

      {user && (
        <footer className="home-footer">
          <Button variant="danger" onClick={signOut}>
            Выйти из аккаунта
          </Button>
        </footer>
      )}
    </main>
  );
}
