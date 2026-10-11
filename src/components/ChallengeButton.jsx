import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHALLENGE_LIMITS } from "../../lib/challenge.js";
import { apiRequest } from "../lib/api.js";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import Segmented from "./Segmented.jsx";

/** Opens a small dialog, creates an async challenge and goes to its page. */
export default function ChallengeButton({ quiz, variant = "secondary", size }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const available = quiz.questionCount ?? quiz.questions?.length ?? 0;
  const choices = CHALLENGE_LIMITS.questionCounts.filter((count) => count < available);
  const options = [...new Set([...choices, Math.min(available, Math.max(...CHALLENGE_LIMITS.questionCounts))])];
  const [count, setCount] = useState(Math.min(CHALLENGE_LIMITS.defaultCount, available));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const { challenge } = await apiRequest("/api/challenges", {
        method: "POST",
        body: { quizId: quiz.id, count },
      });
      navigate(`/c/${challenge.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={!available}>
        Вызов по ссылке
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Вызов по ссылке">
        <p className="dialog-text">
          Друзья пройдут те же вопросы, когда им удобно, — по {CHALLENGE_LIMITS.secondsPerQuestion} секунд на
          вопрос. Потом сравните результаты по каждому вопросу.
        </p>
        <div className="dialog-grid">
          <span className="field-label">Вопросов</span>
          <Segmented
            options={options.map((value) => ({ value, label: String(value) }))}
            value={count}
            onChange={(value) => setCount(Number(value))}
            label="Количество вопросов"
          />
        </div>
        {error && <p className="notice notice-bad">{error}</p>}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button variant="accent" onClick={create} loading={busy}>
            Создать вызов
          </Button>
        </div>
      </Modal>
    </>
  );
}
