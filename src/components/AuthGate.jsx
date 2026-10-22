import { Link, useLocation } from "react-router-dom";
import Button from "./Button.jsx";
import PageLayout from "./PageLayout.jsx";

/** A class code works without an account; send people who came for a game to /play. */
function classJoinPath(location) {
  const room = location.pathname.match(/^\/room\/([A-Za-z0-9]+)/)?.[1];
  const code = room || new URLSearchParams(location.search).get("code");
  if (!room && !location.pathname.startsWith("/multi/join")) return null;
  return code ? `/play/${code}` : "/play";
}

export default function AuthGate({ message = "Войдите, чтобы продолжить." }) {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  const playPath = classJoinPath(location);
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
      {playPath && (
        <p className="muted gate-play">
          Код от учителя для игры в классе? <Link to={playPath}>Войти в игру без аккаунта →</Link>
        </p>
      )}
    </PageLayout>
  );
}
