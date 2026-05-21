import Button from "../components/Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";

const FEATURES = [
  {
    id: "solo",
    icon: "📘",
    title: "Соло-тест",
    desc: "20 вопросов в своём темпе с мгновенной проверкой и разбором.",
    to: "/solo",
    cta: "Начать",
    variant: "primary",
    accent: "solo",
  },
  {
    id: "duel",
    icon: "⚔️",
    title: "Дуэль",
    desc: "Сразитесь с другом: таймер, очки за скорость и настройки комнаты.",
    to: null,
    cta: null,
    variant: "primary",
    accent: "duel",
  },
  {
    id: "answers",
    icon: "✓",
    title: "Справочник",
    desc: "Все вопросы и правильные варианты — удобно повторить перед экзаменом.",
    to: "/answers",
    cta: "Открыть",
    variant: "secondary",
    accent: "answers",
  },
];

export default function HomePage() {
  const { user, profile, signOut, isConfigured } = useAuth();
  const displayName = profile?.username || user?.email?.split("@")[0];

  return (
    <main className="app home-page">
      <div className="home-bg" aria-hidden="true">
        <span className="home-orb home-orb-a" />
        <span className="home-orb home-orb-b" />
        <span className="home-grid" />
      </div>

      <header className="home-hero">
        <p className="chip home-chip">MS SQL Server</p>
        <h1 className="home-title">
          Тренировочный
          <span className="home-title-accent"> тест</span>
        </h1>
        <p className="home-lead">
          Готовьтесь к экзамену в соло-режиме или устройте дуэль с другом в реальном
          времени.
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

      <section className="home-features" aria-label="Режимы">
        {FEATURES.map((feature) => (
          <article
            key={feature.id}
            className={`home-feature-card home-feature-${feature.accent}`}
          >
            <span className="home-feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <h2>{feature.title}</h2>
            <p>{feature.desc}</p>
            {feature.id === "duel" ? (
              user ? (
                <div className="home-feature-actions">
                  <Button variant="primary" to="/multi/create">
                    Создать
                  </Button>
                  <Button variant="secondary" to="/multi/join">
                    Войти
                  </Button>
                </div>
              ) : (
                <div className="home-feature-actions">
                  <Button variant="primary" to="/login">
                    Войти
                  </Button>
                  <Button variant="secondary" to="/register">
                    Регистрация
                  </Button>
                </div>
              )
            ) : (
              <Button variant={feature.variant} to={feature.to}>
                {feature.cta}
              </Button>
            )}
          </article>
        ))}
      </section>

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
