import Button from "./Button.jsx";
import PageLayout from "./PageLayout.jsx";

export default function AuthGate({ message = "Войдите, чтобы продолжить." }) {
  return (
    <PageLayout className="intro">
      <p className="subtitle">{message}</p>
      <div className="stack stack-center">
        <Button variant="primary" to="/login" block>
          Войти
        </Button>
        <Button variant="secondary" to="/register" block>
          Регистрация
        </Button>
      </div>
    </PageLayout>
  );
}
