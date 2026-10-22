import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRoomState } from "../hooks/useRoomState.js";
import { apiRequest, clearRoomSession, loadRoomSession, saveRoomSession } from "../lib/api.js";
import { loadNickname, saveNickname } from "../lib/classroom.js";
import { NICKNAME_MAX, normalizeNickname } from "../../lib/classroom.js";
import ClassroomPlayer from "./classroom/ClassroomPlayer.jsx";

const CODE_LENGTH = 6;
const CODE_CHARS = /[^A-HJ-NP-Z2-9]/g;

function cleanCode(value) {
  return String(value || "").toUpperCase().replace(CODE_CHARS, "").slice(0, CODE_LENGTH);
}

function JoinForm({ initialCode, notice, onJoined }) {
  const { user, profile, signInAsGuest } = useAuth();
  const [code, setCode] = useState(cleanCode(initialCode));
  const [nickname, setNickname] = useState(
    () => loadNickname() || (profile?.username || "").slice(0, NICKNAME_MAX)
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nickname && profile?.username) setNickname(profile.username.slice(0, NICKNAME_MAX));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.username]);

  async function handleSubmit(event) {
    event.preventDefault();
    const checked = normalizeNickname(nickname);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (!user) await signInAsGuest();
      const { room } = await apiRequest("/api/rooms/join", {
        method: "POST",
        body: { code, nickname: checked.nickname },
      });
      saveNickname(checked.nickname);
      saveRoomSession(room.code, room.id);
      onJoined(room.code);
    } catch (err) {
      setError(
        /anonymous/i.test(err.message)
          ? "Вход без аккаунта сейчас недоступен — попросите ведущего проверить настройки"
          : err.message
      );
      setLoading(false);
    }
  }

  return (
    <PageLayout width="narrow" className="cls-join-page">
      <p className="eyebrow">Игра в классе</p>
      <h1 className="page-title">Войти в игру</h1>
      <p className="lead">Код — на большом экране. Аккаунт не нужен.</p>
      {notice && <p className="notice">{notice}</p>}
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Код комнаты</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="ABC123"
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            autoFocus={!initialCode}
          />
        </label>
        <label className="field">
          <span className="field-label">Ваше имя</span>
          <input
            className="input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            placeholder="Как вас увидят на экране"
            required
            autoFocus={Boolean(initialCode)}
          />
          <span className="field-hint">Его увидит весь класс</span>
        </label>
        {error && <p className="notice notice-bad">{error}</p>}
        <Button variant="primary" size="lg" type="submit" block loading={loading} disabled={code.length !== CODE_LENGTH}>
          Играть
        </Button>
      </form>
    </PageLayout>
  );
}

function PlayerRoom({ code, onLost }) {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const { state, error, loading, act, now } = useRoomState(code);

  // the hook keeps the last state on errors, so a removed player must be caught by the message
  useEffect(() => {
    if (loading || !error) return;
    if (!state || /участник|не найдена/i.test(error)) onLost(error);
  }, [state, loading, error, onLost]);

  useEffect(() => {
    if (!state) return;
    // a duel, or the host opening the player link: the regular room page handles it
    if (state.viewer?.mode !== "classroom" || state.viewer.isHost) navigate(`/room/${code}`, { replace: true });
  }, [state, code, navigate]);

  const leave = useCallback(async () => {
    if (state?.room?.status !== "finished") {
      const ok = await confirm({
        title: "Выйти из игры?",
        body: "Очки пропадут. Вернуться можно по коду, но уже с нуля.",
        confirmText: "Выйти",
        tone: "danger",
      });
      if (!ok) return;
      await act("/api/rooms/leave").catch((err) => toast(err.message, { tone: "bad" }));
    }
    clearRoomSession(code);
    navigate("/");
  }, [state?.room?.status, confirm, act, toast, code, navigate]);

  if (!state) return <PageSkeleton />;
  if (state.viewer?.mode !== "classroom" || state.viewer.isHost) return <PageSkeleton />;
  return <ClassroomPlayer state={state} act={act} now={now} onLeave={leave} />;
}

export default function PlayPage() {
  const { code: paramCode } = useParams();
  const navigate = useNavigate();
  const { user, guest, loading } = useAuth();
  const code = cleanCode(paramCode);
  const signedIn = Boolean(user || guest);
  const [joined, setJoined] = useState(() => Boolean(code && loadRoomSession(code)));
  const [notice, setNotice] = useState("");

  const onLost = useCallback(
    (message) => {
      clearRoomSession(code);
      setJoined(false);
      setNotice(/участник/i.test(message) ? "Вы больше не в этой комнате — войдите снова." : message);
    },
    [code]
  );

  if (loading) return <PageSkeleton />;

  if (joined && signedIn && code) {
    return <PlayerRoom key={code} code={code} onLost={onLost} />;
  }

  return (
    <JoinForm
      initialCode={code}
      notice={notice}
      onJoined={(joinedCode) => {
        setNotice("");
        setJoined(true);
        if (joinedCode !== code) navigate(`/play/${joinedCode}`, { replace: true });
      }}
    />
  );
}
