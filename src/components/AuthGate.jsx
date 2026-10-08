import Button from "./Button.jsx";
import PageLayout from "./PageLayout.jsx";

export default function AuthGate({ message = "Войдите, чтобы продолжить." }) {
  return (
    <PageLayout width="narrow" className="gate">
      <p className="eyebrow">Нужен аккаунт</p>
      <h1 className="page-title">{message}</h1>
      <div className="row">
        <Button variant="primary" to="/login">
          Войти
        </Button>
        <Button variant="secondary" to="/register">
          Создать аккаунт
        </Button>
      </div>
    </PageLayout>
  );
}
