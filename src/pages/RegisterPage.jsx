import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout, { Field } from "../components/AuthLayout.jsx";
import Button from "../components/Button.jsx";
import ConsentText from "../components/ConsentText.jsx";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { humanizeAuthError } from "../lib/format.js";
import { safeNextPath } from "../lib/share.js";

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const nextQuery = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [consent, setConsent] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await signUp(email, password, username.trim());
      if (data.session) {
        navigate(next, { replace: true });
        return;
      }
      setCheckEmail(true);
    } catch (err) {
      setError(humanizeAuthError(err.message));
    }
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <AuthLayout
        title="Проверьте почту"
        lead={`Мы отправили ссылку для подтверждения на ${email}. После подтверждения можно войти.`}
      >
        <Button variant="primary" to="/login">
          Ко входу
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Новый аккаунт"
      lead="Тесты хранятся в аккаунте, а никнейм увидит соперник в дуэли."
      footer={
        <>
          Уже есть аккаунт? <Link to={`/login${nextQuery}`}>Войти</Link>
        </>
      }
    >
      <form className="form" onSubmit={handleSubmit}>
        <Field label="Никнейм">
          <input
            className="input"
            autoComplete="nickname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            required
            autoFocus
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Пароль" hint="Минимум 6 символов">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            className="check"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>
            Даю{" "}
            <button type="button" className="link-btn link-inline" onClick={() => setShowConsent(true)}>
              согласие на обработку персональных данных
            </button>
            , включая передачу за границу. Подробнее — в{" "}
            <Link to="/privacy" target="_blank">
              политике
            </Link>
          </span>
        </label>
        {error && <p className="notice notice-bad">{error}</p>}
        <Button variant="primary" type="submit" size="lg" block loading={loading} disabled={!consent}>
          Создать аккаунт
        </Button>
      </form>
      <Modal open={showConsent} onClose={() => setShowConsent(false)} title="Согласие на обработку данных" wide>
        <ConsentText />
        <div className="dialog-actions">
          <Button
            variant="primary"
            onClick={() => {
              setConsent(true);
              setShowConsent(false);
            }}
          >
            Даю согласие
          </Button>
        </div>
      </Modal>
    </AuthLayout>
  );
}
