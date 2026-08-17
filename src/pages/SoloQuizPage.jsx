import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import AuthGate from "../components/AuthGate.jsx";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest } from "../lib/api.js";
import { gradeAnswerDetailed } from "../../lib/gameLogic.js";
import { arraysEqualAsSet, shuffleArray } from "../lib/quiz.js";

function prepareQuestionsSet(sourceQuestions) {
  return shuffleArray(sourceQuestions).map((question) => {
    const optionsWithFlags = question.options.map((optionText, optionIndex) => ({
      text: optionText,
      isCorrect: question.correct.includes(optionIndex),
    }));
    return {
      id: question.id,
      type: question.type,
      text: question.text,
      options: shuffleArray(optionsWithFlags),
    };
  });
}

function getCorrectIndexes(question) {
  return question.options.reduce((acc, option, index) => {
    if (option.isCorrect) acc.push(index);
    return acc;
  }, []);
}

function toGradeQuestion(question) {
  return {
    type: question.type,
    correct: getCorrectIndexes(question),
    options: question.options.map((option) => option.text),
  };
}

function isQuestionCorrect(question, selected) {
  return arraysEqualAsSet(selected, getCorrectIndexes(question));
}

function getAnswerState(question, selected) {
  const selectedSet = new Set(selected);
  return question.options.map((option, optionIndex) => {
    const isSelected = selectedSet.has(optionIndex);
    const isCorrect = option.isCorrect;
    if (isCorrect && isSelected) return "right-selected";
    if (isCorrect && !isSelected) return "right-missed";
    if (!isCorrect && isSelected) return "wrong-selected";
    return "neutral";
  });
}

export default function SoloQuizPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [quiz, setQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checkedMap, setCheckedMap] = useState({});

  useEffect(() => {
    if (!user || !id) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [{ quiz: nextQuiz }, attemptData] = await Promise.all([
          apiRequest(`/api/quizzes/${id}`),
          apiRequest(`/api/quizzes/${id}/attempt`).catch(() => ({ attempts: [] })),
        ]);
        if (cancelled) return;
        setQuiz(nextQuiz);
        setAttempts(attemptData.attempts || []);
        setQuestions(prepareQuestionsSet(nextQuiz.questions || []));
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  const currentQuestion = questions[currentIndex];
  const selected = answers[currentQuestion?.id] || [];
  const currentChecked = Boolean(checkedMap[currentQuestion?.id]);
  const currentAnswerStates = currentQuestion
    ? getAnswerState(currentQuestion, selected)
    : [];
  const currentGrade =
    currentQuestion && currentChecked
      ? gradeAnswerDetailed(toGradeQuestion(currentQuestion), selected)
      : null;
  const score = useMemo(
    () =>
      questions.reduce((acc, question) => {
        const userSelected = answers[question.id] || [];
        return isQuestionCorrect(question, userSelected) ? acc + 1 : acc;
      }, 0),
    [answers, questions]
  );
  const progressPercent = questions.length
    ? Math.round(((currentIndex + 1) / questions.length) * 100)
    : 0;
  const isLastQuestion = currentIndex === questions.length - 1;

  function handleOptionToggle(optionIndex) {
    setCheckedMap((prev) => ({ ...prev, [currentQuestion.id]: false }));
    setAnswers((prev) => {
      const previous = prev[currentQuestion.id] || [];
      if (currentQuestion.type === "single") {
        return { ...prev, [currentQuestion.id]: [optionIndex] };
      }
      const isActive = previous.includes(optionIndex);
      const next = isActive
        ? previous.filter((item) => item !== optionIndex)
        : [...previous, optionIndex].sort((a, b) => a - b);
      return { ...prev, [currentQuestion.id]: next };
    });
  }

  function handleCheckAnswer() {
    if (!selected.length) return;
    setCheckedMap((prev) => ({ ...prev, [currentQuestion.id]: true }));
  }

  async function handleNext() {
    if (!selected.length || !currentChecked) return;
    if (isLastQuestion) {
      try {
        await apiRequest(`/api/quizzes/${id}/attempt`, {
          method: "POST",
          body: { score, total: questions.length },
        });
        setAttempts((prev) => [
          {
            id: `local-${Date.now()}`,
            score,
            total: questions.length,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      } catch (err) {
        console.error(err);
      }
      setFinished(true);
      return;
    }
    setCurrentIndex((prev) => prev + 1);
  }

  function handleRestart() {
    setStarted(true);
    setFinished(false);
    setCurrentIndex(0);
    setAnswers({});
    setCheckedMap({});
    setQuestions(prepareQuestionsSet(quiz.questions || []));
  }

  if (authLoading || loading) {
    return (
      <PageLayout className="intro">
        <p className="muted">Загрузка...</p>
      </PageLayout>
    );
  }

  if (!user) {
    return <AuthGate message="Войдите, чтобы готовиться по своему тесту." />;
  }

  if (loadError || !quiz) {
    return (
      <PageLayout className="intro">
        <p className="live-result wrong">{loadError || "Тест не найден"}</p>
        <Button variant="primary" to="/me/quizzes" block>
          К тестам
        </Button>
      </PageLayout>
    );
  }

  if (!quiz.questions?.length) {
    return (
      <PageLayout className="intro">
        <h1>{quiz.title}</h1>
        <p className="subtitle">Добавьте вопросы в редакторе, затем можно готовиться.</p>
        <Button variant="primary" to={`/me/quizzes/${quiz.id}/edit`} block>
          Открыть редактор
        </Button>
      </PageLayout>
    );
  }

  if (!started) {
    return (
      <PageLayout className="intro">
        <p className="chip">Подготовка</p>
        <h1>{quiz.title}</h1>
        <p className="subtitle">
          {quiz.questions.length} вопросов, разбор сразу после ответа.
        </p>
        <div className="stack stack-center">
          <Button variant="primary" block onClick={handleRestart}>
            Начать
          </Button>
          <Button variant="secondary" to={`/me/quizzes/${quiz.id}/review`} block>
            Справочник
          </Button>
          <Button variant="secondary" to="/me/quizzes" block>
            К тестам
          </Button>
        </div>
        <p className="muted">Завершённых попыток: {attempts.length}</p>
      </PageLayout>
    );
  }

  if (finished) {
    return (
      <main className="app">
        <section className="card summary page-centered victory-screen">
          <p className="chip victory-chip">Результат</p>
          <h1 className="victory-title">Тест завершён</h1>
          <p className="subtitle">
            Балл: <b>{score}</b> из <b>{questions.length}</b>
          </p>
          <div className="stack stack-center">
            <Button variant="primary" block onClick={handleRestart}>
              Пройти заново
            </Button>
            {quiz.status === "published" && (
              <Button variant="accent" to={`/multi/create?quiz=${quiz.id}`} block>
                Вызвать на дуэль
              </Button>
            )}
            <Button variant="secondary" to={`/me/quizzes/${quiz.id}/review`} block>
              Справочник
            </Button>
            <Button variant="secondary" to="/me/quizzes" block>
              К тестам
            </Button>
          </div>
        </section>
        <section className="card review">
          <h2>Разбор ответов</h2>
          <div className="review-list">
            {questions.map((question, index) => {
              const userSelected = answers[question.id] || [];
              const states = getAnswerState(question, userSelected);
              const grade = gradeAnswerDetailed(toGradeQuestion(question), userSelected);
              const badgeClass = grade.isFullyCorrect
                ? "badge right"
                : grade.isPartial
                  ? "badge partial"
                  : "badge wrong";
              const badgeText = grade.isFullyCorrect
                ? "Верно"
                : grade.isPartial
                  ? "Частично"
                  : "Неверно";
              return (
                <article className="review-item" key={question.id}>
                  <div className="review-header">
                    <h3>
                      {index + 1}. {question.text}
                    </h3>
                    <span className={badgeClass}>{badgeText}</span>
                  </div>
                  <ul className="review-options">
                    {question.options.map((option, idx) => (
                      <li key={`${question.id}-${idx}`} className={`state-${states[idx]}`}>
                        {option.text}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="card quiz">
        <div className="top-row">
          <p className="counter">
            Вопрос {currentIndex + 1} / {questions.length}
          </p>
          <Button variant="secondary" to="/me/quizzes">
            Выход
          </Button>
        </div>
        <div className="progress-wrap" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
        <h1>{currentQuestion.text}</h1>
        <p className="type-tip">
          {currentQuestion.type === "multiple"
            ? "Можно выбрать несколько вариантов."
            : "Один вариант ответа."}
        </p>
        {currentGrade && (
          <p
            className={
              currentGrade.isFullyCorrect
                ? "live-result right"
                : currentGrade.isPartial
                  ? "live-result partial"
                  : "live-result wrong"
            }
          >
            {currentGrade.isFullyCorrect
              ? "Верно!"
              : currentGrade.isPartial
                ? "Частично верно: выбраны не все правильные варианты или есть лишние."
                : "Неверно."}
          </p>
        )}
        <div className="options">
          {currentQuestion.options.map((option, idx) => {
            const checked = selected.includes(idx);
            const answerState = currentChecked ? `state-${currentAnswerStates[idx]}` : "";
            return (
              <label
                key={`${currentQuestion.id}-${idx}`}
                className={checked ? `option active ${answerState}` : `option ${answerState}`}
              >
                <input
                  type={currentQuestion.type === "multiple" ? "checkbox" : "radio"}
                  checked={checked}
                  onChange={() => handleOptionToggle(idx)}
                />
                <span>{option.text}</span>
              </label>
            );
          })}
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
          >
            Назад
          </Button>
          <Button
            variant="accent"
            onClick={handleCheckAnswer}
            disabled={!selected.length || currentChecked}
          >
            Проверить
          </Button>
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={!selected.length || !currentChecked}
          >
            {isLastQuestion ? "Завершить" : "Далее"}
          </Button>
        </div>
      </section>
    </main>
  );
}
