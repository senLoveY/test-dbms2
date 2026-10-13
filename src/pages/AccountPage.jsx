import { useState } from "react";
import { Link } from "react-router-dom";
import { Field } from "../components/AuthLayout.jsx";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useDeleteAccount } from "../hooks/useDeleteAccount.js";
import { apiRequest } from "../lib/api.js";
import { humanizeAuthError } from "../lib/format.js";
import { supabase } from "../lib/supabase.js";
import { USERNAME_MAX } from "../../lib/privacy.js";

function formatDate(value) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function UsernameForm() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useFeedback();
  const [username, setUsername] = useState(profile?.username || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = username.trim() && username.trim() !== profile?.username;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/account", { method: "PATCH", body: { username } });
      await refreshProfile();
      toast("Никнейм изменён");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form account-form" onSubmit={save}>
      <Field label="Никнейм" hint="Его видят соперники в дуэлях и участники вызовов">
        <input
          className="input"
          autoComplete="nickname"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={USERNAME_MAX}
          required
        />
      </Field>
      {error && <p className="notice notice-bad">{error}</p>}
      <div>
        <Button variant="secondary" type="submit" loading={busy} disabled={!changed}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function EmailForm() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const changed = email.trim() && email.trim() !== user?.email;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
      if (updateError) throw updateError;
      setSentTo(email.trim());
    } catch (err) {
      setError(humanizeAuthError(err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form account-form" onSubmit={save}>
      <Field label="Email" hint="Виден только вам. Новый адрес заработает после подтверждения по ссылке из письма">
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      {sentTo && <p className="notice">Отправили письмо со ссылкой для подтверждения на {sentTo}.</p>}
      {error && <p className="notice notice-bad">{error}</p>}
      <div>
        <Button variant="secondary" type="submit" loading={busy} disabled={!changed}>
          Сменить email
        </Button>
      </div>
    </form>
  );
}

/** Downloads everything the API has about the user as a JSON file. */
async function downloadMyData() {
  const { data } = await apiRequest("/api/account/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AccountPage() {
  const { profile } = useAuth();
  const { toast } = useFeedback();
  const deleteAccount = useDeleteAccount();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      await downloadMyData();
    } catch (err) {
      toast(err.message || "Не получилось выгрузить данные", { tone: "bad" });
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    setDeleting(true);
    const deleted = await deleteAccount();
    if (!deleted) setDeleting(false);
  }

  return (
    <PageLayout width="narrow" className="account">
      <p className="eyebrow">Аккаунт</p>
      <h1 className="page-title">Аккаунт и данные</h1>
      <p className="lead">
        Что о вас хранится и как этим управлять. Подробности — в{" "}
        <Link to="/privacy">политике обработки персональных данных</Link>.
      </p>

      <section className="section">
        <h2 className="section-title">Профиль</h2>
        <div className="account-forms">
          {profile && <UsernameForm key={profile.username} />}
          <EmailForm />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Мои данные</h2>
        <p className="account-text">
          Один JSON-файл со всем, что хранится: профиль, тесты с вопросами, попытки, результаты вызовов и дуэлей.
        </p>
        <div className="row">
          <Button variant="secondary" onClick={exportData} loading={exporting}>
            Скачать мои данные
          </Button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Согласие на обработку</h2>
        <p className="account-text">
          {/* the date already ends with "г." */}
          {profile?.consent_at && `Дано ${formatDate(profile.consent_at)} `}
          Отозвать согласие — значит удалить аккаунт: без него хранить ваши тесты и результаты нельзя.{" "}
          <Link to="/privacy#consent">Текст согласия</Link>
        </p>
      </section>

      <section className="section danger-zone">
        <h2 className="section-title">Удаление аккаунта</h2>
        <p className="account-text">
          Сотрутся аккаунт, все ваши тесты, попытки, вызовы и ваши результаты в чужих вызовах. Это нельзя отменить —
          если нужна копия, сначала скачайте данные.
        </p>
        <div className="row">
          <Button variant="danger" onClick={remove} loading={deleting}>
            Удалить аккаунт
          </Button>
        </div>
      </section>
    </PageLayout>
  );
}
