import { lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import { FeedbackProvider } from "./components/Feedback.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import HomePage from "./pages/HomePage.jsx";

const pages = {
  login: () => import("./pages/LoginPage.jsx"),
  register: () => import("./pages/RegisterPage.jsx"),
  quizList: () => import("./pages/QuizListPage.jsx"),
  quizEditor: () => import("./pages/QuizEditorPage.jsx"),
  quizReview: () => import("./pages/QuizReviewPage.jsx"),
  solo: () => import("./pages/SoloQuizPage.jsx"),
  multiCreate: () => import("./pages/MultiCreatePage.jsx"),
  multiJoin: () => import("./pages/MultiJoinPage.jsx"),
  room: () => import("./pages/RoomPage.jsx"),
};

const LoginPage = lazy(pages.login);
const RegisterPage = lazy(pages.register);
const QuizListPage = lazy(pages.quizList);
const QuizEditorPage = lazy(pages.quizEditor);
const QuizReviewPage = lazy(pages.quizReview);
const SoloQuizPage = lazy(pages.solo);
const MultiCreatePage = lazy(pages.multiCreate);
const MultiJoinPage = lazy(pages.multiJoin);
const RoomPage = lazy(pages.room);

/** Fetch the remaining page chunks once the browser is idle, so navigation never waits. */
function usePreloadPages() {
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    const handle = idle(() => Object.values(pages).forEach((load) => load().catch(() => {})));
    return () => (window.cancelIdleCallback || clearTimeout)(handle);
  }, []);
}

function LegacyRoomRedirect() {
  const { code } = useParams();
  return <Navigate to={`/room/${code}`} replace />;
}

function Private({ children, message }) {
  return <RequireAuth message={message}>{children}</RequireAuth>;
}

export default function App() {
  usePreloadPages();

  return (
    <AuthProvider>
      <BrowserRouter>
        <FeedbackProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/me/quizzes"
                element={
                  <Private message="Войдите, чтобы управлять своими тестами">
                    <QuizListPage />
                  </Private>
                }
              />
              <Route
                path="/me/quizzes/:id/edit"
                element={
                  <Private message="Войдите, чтобы редактировать тесты">
                    <QuizEditorPage />
                  </Private>
                }
              />
              <Route
                path="/me/quizzes/:id/review"
                element={
                  <Private message="Войдите, чтобы открыть ответы">
                    <QuizReviewPage />
                  </Private>
                }
              />
              <Route
                path="/q/:id/study"
                element={
                  <Private message="Войдите, чтобы готовиться по тесту">
                    <SoloQuizPage />
                  </Private>
                }
              />
              <Route
                path="/multi/create"
                element={
                  <Private message="Войдите, чтобы создать дуэль">
                    <MultiCreatePage />
                  </Private>
                }
              />
              <Route
                path="/multi/join"
                element={
                  <Private message="Войдите, чтобы присоединиться к дуэли">
                    <MultiJoinPage />
                  </Private>
                }
              />
              <Route
                path="/room/:code"
                element={
                  <Private message="Войдите, чтобы вернуться в комнату">
                    <RoomPage />
                  </Private>
                }
              />
              <Route path="/multi/lobby/:code" element={<LegacyRoomRedirect />} />
              <Route path="/multi/play/:code" element={<LegacyRoomRedirect />} />
              <Route path="/solo" element={<Navigate to="/me/quizzes" replace />} />
              <Route path="/answers" element={<Navigate to="/me/quizzes" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </FeedbackProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
