import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout, { Field } from "../components/AuthLayout.jsx";
import Button from "../components/Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { humanizeAuthError } from "../lib/format.js";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      navigate("/");
    } catch (err) {
      setError(humanizeAuthError(err.message));
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="С возвращением"
      lead="Войдите, чтобы открыть свои тесты и дуэли."
      footer={
        <>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </>
      }
    >
      <form className="form" onSubmit={handleSubmit}>
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Пароль">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && <p className="notice notice-bad">{error}</p>}
        <Button variant="primary" type="submit" size="lg" block loading={loading}>
          Войти
        </Button>
      </form>
    </AuthLayout>
  );
}
