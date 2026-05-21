import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import SoloQuizPage from "./pages/SoloQuizPage.jsx";
import AnswersPage from "./pages/AnswersPage.jsx";
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
          <Route path="/solo" element={<SoloQuizPage />} />
          <Route path="/answers" element={<AnswersPage />} />
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
