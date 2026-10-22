import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { useThemePreference } from "../lib/theme.js";
import Segmented from "./Segmented.jsx";

const THEME_OPTIONS = [
  { value: "system", label: "Авто" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

const TABS = [
  {
    to: "/",
    label: "Главная",
    end: true,
    icon: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  },
  {
    to: "/me/quizzes",
    label: "Мои тесты",
    icon: (
      <>
        <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
        <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
      </>
    ),
  },
  {
    to: "/multi/create",
    label: "Играть",
    icon: (
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2" />
    ),
  },
  {
    to: "/multi/join",
    label: "По коду",
    icon: <path d="M9 4 7 20M17 4l-2 16M4.5 9h15M4 15h15" />,
  },
];

function UserMenu({ name, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useThemePreference();
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
          <div className="menu-section">
            <p className="menu-label" aria-hidden="true">
              Тема
            </p>
            <Segmented options={THEME_OPTIONS} value={theme} onChange={setTheme} size="sm" label="Тема" />
          </div>
          <Link to="/me/reports" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            Отчёты уроков
          </Link>
          <Link to="/me/account" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            Аккаунт и данные
          </Link>
          <button type="button" role="menuitem" className="menu-item" onClick={onSignOut}>
            Выйти из аккаунта
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeButton() {
  const [, setTheme] = useThemePreference();
  const isDark = document.documentElement.dataset.theme === "dark";
  const next = isDark ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-btn icon-btn-lg"
      aria-label={isDark ? "Светлая тема" : "Тёмная тема"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      onClick={() => setTheme(next)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {isDark ? (
          <>
            <circle className="icon-stroke" cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </>
        ) : (
          <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
        )}
      </svg>
    </button>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {tab.icon}
          </svg>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
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
  const inGame = /^\/(room|play)\//.test(location.pathname);
  // a stray tap on a tab mid-run would abandon a timed game, so hide the tabs there
  const inPlay = inGame || /^\/(q\/[^/]+\/study|c\/)/.test(location.pathname);
  const showTabs = Boolean(user) && !inPlay;
  // a student's phone in a class game: no links that would take them out of the question
  const onClassPhone = location.pathname.startsWith("/play");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className={`shell ${showTabs ? "has-tabs" : ""}`}>
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header className={`topbar ${inGame ? "topbar-quiet" : ""}`}>
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="На главную">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path d="M4.5 10.5l3.5 3.5 7.5-8.5" />
              </svg>
            </span>
            <span className="brand-name">Тесты&nbsp;и&nbsp;состязания</span>
          </Link>

          {user && !onClassPhone && (
            <nav className="nav" aria-label="Основная навигация">
              <NavLink to="/me/quizzes" className="nav-link">
                Мои тесты
              </NavLink>
              <NavLink to="/multi/create" className="nav-link">
                Играть
              </NavLink>
              <NavLink to="/multi/join" className="nav-link">
                По&nbsp;коду
              </NavLink>
            </nav>
          )}

          <div className="topbar-end">
            {onClassPhone ? null : user ? (
              <UserMenu name={displayName} onSignOut={handleSignOut} />
            ) : (
              <>
                <ThemeButton />
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
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<TopProgress />}>{children}</Suspense>
        </ErrorBoundary>
      </main>

      {showTabs && <TabBar />}
    </div>
  );
}
