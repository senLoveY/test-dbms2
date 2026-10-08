import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout, { PageHeader } from "../components/PageLayout.jsx";
import { apiRequest, saveRoomSession } from "../lib/api.js";

const CODE_LENGTH = 6;
const CODE_CHARS = /[^A-HJ-NP-Z2-9]/g;

export default function MultiJoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => (params.get("code") || "").toUpperCase().replace(CODE_CHARS, "").slice(0, CODE_LENGTH));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const autoJoined = useRef(false);

  async function join(value = code) {
    if (value.length !== CODE_LENGTH || loading) return;
    setError("");
    setLoading(true);
    try {
      const { room } = await apiRequest("/api/rooms/join", {
        method: "POST",
        body: { code: value },
      });
      saveRoomSession(room.code, room.id);
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // Opening an invite link joins straight away
  useEffect(() => {
    if (!autoJoined.current && code.length === CODE_LENGTH && params.get("code")) {
      autoJoined.current = true;
      join(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(event) {
    const next = event.target.value.toUpperCase().replace(CODE_CHARS, "").slice(0, CODE_LENGTH);
    setCode(next);
    setError("");
    if (next.length === CODE_LENGTH) join(next);
  }

  return (
    <PageLayout width="narrow">
      <PageHeader
        eyebrow="Дуэль"
        title="Войти по коду"
        lead="Шесть символов из лобби соперника. Комната откроется сразу после ввода."
      />
      <form
        className="join-form"
        onSubmit={(event) => {
          event.preventDefault();
          join();
        }}
      >
        <input
          className={`code-input ${error ? "is-invalid" : ""}`}
          value={code}
          onChange={onChange}
          placeholder="ABC123"
          maxLength={CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Код комнаты"
          autoFocus
        />
        {error && <p className="notice notice-bad">{error}</p>}
        <Button variant="primary" size="lg" type="submit" block loading={loading} disabled={code.length !== CODE_LENGTH}>
          Войти в комнату
        </Button>
      </form>
    </PageLayout>
  );
}
