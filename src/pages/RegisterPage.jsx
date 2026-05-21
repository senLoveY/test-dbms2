import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(email, password, username);
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout className="intro">
      <h1>Регистрация</h1>
      <p className="subtitle">Создайте аккаунт для мультиплеера.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Никнейм
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error && <p className="live-result wrong">{error}</p>}
        <Button variant="primary" type="submit" block disabled={loading}>
          {loading ? "Создание..." : "Создать аккаунт"}
        </Button>
      </form>
      <p className="muted">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
      <div className="stack stack-center">
        <Button variant="secondary" to="/" block>
          На главную
        </Button>
      </div>
    </PageLayout>
  );
}
