import { useLocation } from "react-router-dom";
import Button from "./Button.jsx";
import PageLayout from "./PageLayout.jsx";

export default function AuthGate({ message = "Войдите, чтобы продолжить." }) {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <PageLayout width="narrow" className="gate">
      <p className="eyebrow">Нужен аккаунт</p>
      <h1 className="page-title">{message}</h1>
      <div className="row">
        <Button variant="primary" to={`/login?next=${next}`}>
          Войти
        </Button>
        <Button variant="secondary" to={`/register?next=${next}`}>
          Создать аккаунт
        </Button>
      </div>
    </PageLayout>
  );
}
