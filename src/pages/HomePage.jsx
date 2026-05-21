import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function HomePage() {
  const { user, profile, signOut, isConfigured } = useAuth();

  return (
    <PageLayout className="intro">
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

      <div className="stack stack-center">
        <Button variant="primary" to="/solo" block>
          Начать соло-тест
        </Button>
        <Button variant="secondary" to="/answers" block>
          Правильные ответы
        </Button>
      </div>

      {user ? (
        <div className="stack stack-center">
          <Button variant="primary" to="/multi/create" block>
            Создать комнату
          </Button>
          <Button variant="secondary" to="/multi/join" block>
            Войти по коду
          </Button>
          <Button variant="danger" block onClick={signOut}>
            Выйти ({profile?.username || user.email})
          </Button>
        </div>
      ) : (
        <div className="stack stack-center">
          <Button variant="primary" to="/login" block>
            Войти
          </Button>
          <Button variant="secondary" to="/register" block>
            Регистрация
          </Button>
        </div>
      )}
    </PageLayout>
  );
}
