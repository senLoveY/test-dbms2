import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import QuizListPage from "./pages/QuizListPage.jsx";
import QuizEditorPage from "./pages/QuizEditorPage.jsx";
import QuizReviewPage from "./pages/QuizReviewPage.jsx";
import SoloQuizPage from "./pages/SoloQuizPage.jsx";
import MultiCreatePage from "./pages/MultiCreatePage.jsx";
import MultiJoinPage from "./pages/MultiJoinPage.jsx";
import MultiLobbyPage from "./pages/MultiLobbyPage.jsx";
import MultiPlayPage from "./pages/MultiPlayPage.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/me/quizzes" element={<QuizListPage />} />
          <Route path="/me/quizzes/:id/edit" element={<QuizEditorPage />} />
          <Route path="/me/quizzes/:id/review" element={<QuizReviewPage />} />
          <Route path="/q/:id/study" element={<SoloQuizPage />} />
          <Route path="/solo" element={<Navigate to="/me/quizzes" replace />} />
          <Route path="/answers" element={<Navigate to="/me/quizzes" replace />} />
          <Route path="/multi/create" element={<MultiCreatePage />} />
          <Route path="/multi/join" element={<MultiJoinPage />} />
          <Route path="/multi/lobby/:code" element={<MultiLobbyPage />} />
          <Route path="/multi/play/:code" element={<MultiPlayPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
