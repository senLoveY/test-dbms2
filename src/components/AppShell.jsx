import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { clearQuizCache } from "../lib/quizStore.js";

function UserMenu({ name, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="user-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {name?.[0]?.toUpperCase() || "?"}
        </span>
        <span className="user-name">{name}</span>
      </button>
      {open && (
        <div className="menu-list menu-end" role="menu">
          <p className="menu-caption">{name}</p>
          <button type="button" role="menuitem" className="menu-item" onClick={onSignOut}>
            Выйти из аккаунта
          </button>
        </div>
      )}
    </div>
  );
}

function TopProgress() {
  return <div className="top-progress" aria-hidden="true" />;
}

export default function AppShell({ children }) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = profile?.username || user?.email?.split("@")[0];
  const inGame = location.pathname.startsWith("/room/");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    clearQuizCache();
    navigate("/");
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header className={`topbar ${inGame ? "topbar-quiet" : ""}`}>
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="На главную">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Тесты&nbsp;и&nbsp;состязания</span>
          </Link>

          {user && (
            <nav className="nav" aria-label="Основная навигация">
              <NavLink to="/me/quizzes" className="nav-link">
                Мои тесты
              </NavLink>
              <NavLink to="/multi/create" className="nav-link">
                Дуэль
              </NavLink>
              <NavLink to="/multi/join" className="nav-link">
                По&nbsp;коду
              </NavLink>
            </nav>
          )}

          <div className="topbar-end">
            {user ? (
              <UserMenu name={displayName} onSignOut={handleSignOut} />
            ) : (
              <>
                <NavLink to="/login" className="nav-link">
                  Войти
                </NavLink>
                <Link to="/register" className="btn btn-primary btn-sm">
                  <span className="btn-label">Регистрация</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="main" key={location.pathname}>
        <Suspense fallback={<TopProgress />}>{children}</Suspense>
      </main>
    </div>
  );
}
