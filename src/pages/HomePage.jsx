import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function HomePage() {
  const { user, profile, signOut, isConfigured } = useAuth();

  return (
    <main className="app">
      <section className="card intro">
        <p className="chip">MS SQL Server</p>
        <h1>Тренировочный тест</h1>
        <p className="subtitle">
          Соло-режим, дуэль с другом в реальном времени и справочник ответов.
        </p>

        {!isConfigured && (
          <p className="live-result wrong">
            Supabase не настроен. Добавьте переменные из `.env.example`.
          </p>
        )}

        <div className="intro-actions">
          <Link className="primary-btn intro-action-btn" to="/solo">
            Начать соло-тест
          </Link>
          <Link className="ghost-btn intro-action-btn" to="/answers">
            Правильные ответы
          </Link>
        </div>

        {user ? (
          <div className="intro-actions">
            <Link className="primary-btn intro-action-btn" to="/multi/create">
              Создать комнату
            </Link>
            <Link className="ghost-btn intro-action-btn" to="/multi/join">
              Войти по коду
            </Link>
            <button className="ghost-btn intro-action-btn" type="button" onClick={signOut}>
              Выйти ({profile?.username || user.email})
            </button>
          </div>
        ) : (
          <div className="intro-actions">
            <Link className="primary-btn intro-action-btn" to="/login">
              Войти
            </Link>
            <Link className="ghost-btn intro-action-btn" to="/register">
              Регистрация
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
