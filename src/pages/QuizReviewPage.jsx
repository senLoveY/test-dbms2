import { Link, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout, { PageHeader } from "../components/PageLayout.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { formatQuestions, pad2 } from "../lib/format.js";
import { useQuiz } from "../lib/quizStore.js";

export default function QuizReviewPage() {
  const { id } = useParams();
  const { quiz, loading, error } = useQuiz(id);

  if (loading) return <PageSkeleton />;

  if (error || !quiz) {
    return (
      <PageLayout width="narrow">
        <p className="notice notice-bad">{error || "Тест не найден"}</p>
        <Button variant="secondary" to="/me/quizzes">
          ← К тестам
        </Button>
      </PageLayout>
    );
  }

  const questions = quiz.questions || [];

  return (
    <PageLayout>
      <Link to="/me/quizzes" className="link-quiet">
        ← Мои тесты
      </Link>
      <PageHeader
        eyebrow="Ответы · видны только автору"
        title={quiz.title}
        lead={formatQuestions(questions.length)}
        actions={
          <>
            <Button variant="secondary" to={`/me/quizzes/${quiz.id}/edit`}>
              Редактировать
            </Button>
            <Button variant="primary" to={`/q/${quiz.id}/study`} disabled={!questions.length}>
              Пройти соло
            </Button>
          </>
        }
      />

      <ol className="review">
        {questions.map((question, index) => (
          <li className="review-item" key={question.id || index} style={{ "--i": Math.min(index, 12) }}>
            <div className="review-head">
              <span className="review-num">{pad2(index + 1)}</span>
              <p className="review-q">{question.text}</p>
              <span className="pill">{question.type === "multiple" ? "несколько" : "один"}</span>
            </div>
            <ul className="review-options">
              {question.options.map((option, optionIndex) => (
                <li
                  key={optionIndex}
                  className={question.correct.includes(optionIndex) ? "state-right-selected" : "state-neutral"}
                >
                  {option}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </PageLayout>
  );
}
