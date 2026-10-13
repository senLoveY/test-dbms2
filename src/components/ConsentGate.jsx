import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useDeleteAccount } from "../hooks/useDeleteAccount.js";
import { apiRequest } from "../lib/api.js";
import { CONSENT_VERSION } from "../../lib/privacy.js";
import Button from "./Button.jsx";
import ConsentText from "./ConsentText.jsx";
import PageLayout from "./PageLayout.jsx";

/** For accounts created before consent was collected, or after its text changed. */
export default function ConsentGate() {
  const { profile, refreshProfile, signOut } = useAuth();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const renewal = Boolean(profile?.consent_version);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/account/consent", { method: "POST", body: { version: CONSENT_VERSION } });
      await refreshProfile();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function leave() {
    await signOut();
    navigate("/");
  }

  return (
    <PageLayout width="narrow" className="consent-gate">
      <p className="eyebrow">Перед продолжением</p>
      <h1 className="page-title">Согласие на обработку персональных данных</h1>
      <p className="lead">
        {renewal
          ? "Условия обработки данных изменились. Прочитайте новый текст и подтвердите согласие."
          : "Чтобы хранить ваши тесты и результаты, нам нужно ваше согласие. Вот что оно означает."}
      </p>

      <div className="consent-box">
        <ConsentText />
      </div>

      {error && <p className="notice notice-bad">{error}</p>}
      <div className="row">
        <Button variant="primary" onClick={accept} loading={busy}>
          Даю согласие
        </Button>
        <Button variant="ghost" onClick={leave} disabled={busy}>
          Выйти
        </Button>
        <Button variant="danger" onClick={deleteAccount} disabled={busy}>
          Отказаться и удалить аккаунт
        </Button>
      </div>
    </PageLayout>
  );
}
