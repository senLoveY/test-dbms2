import { useMemo, useState } from "react";
import { questions } from "./questions";

function arraysEqualAsSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

function getAnswerState(question, selected) {
  const selectedSet = new Set(selected);
  const correctSet = new Set(question.correct);

  return question.options.map((_, optionIndex) => {
    const isSelected = selectedSet.has(optionIndex);
    const isCorrect = correctSet.has(optionIndex);

    if (isCorrect && isSelected) return "right-selected";
    if (isCorrect && !isSelected) return "right-missed";
    if (!isCorrect && isSelected) return "wrong-selected";
    return "neutral";
  });
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [attempts, setAttempts] = useState(
    Number(localStorage.getItem("quizAttempts") || 0)
  );

  const currentQuestion = questions[currentIndex];
  const selected = answers[currentQuestion?.id] || [];
  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => value.length > 0).length,
    [answers]
  );

  const score = useMemo(() => {
    return questions.reduce((acc, question) => {
      const userSelected = answers[question.id] || [];
      return arraysEqualAsSet(userSelected, question.correct) ? acc + 1 : acc;
    }, 0);
  }, [answers]);

  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100);
  const isLastQuestion = currentIndex === questions.length - 1;

  function handleOptionToggle(optionIndex) {
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

  function handleNext() {
    if (!selected.length) return;
    if (isLastQuestion) {
      const nextAttempts = attempts + 1;
      localStorage.setItem("quizAttempts", String(nextAttempts));
      setAttempts(nextAttempts);
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
  }

  if (!started) {
    return (
      <main className="app">
        <section className="card intro">
          <p className="chip">MS SQL Server</p>
          <h1>Тренировочный тест</h1>
          <p className="subtitle">
            20 вопросов, прохождение по одному вопросу. После завершения откроется
            полный разбор с правильными ответами.
          </p>
          <button className="primary-btn" onClick={() => setStarted(true)}>
            Начать тест
          </button>
          <p className="attempts">Завершенных попыток: {attempts}</p>
        </section>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="app">
        <section className="card summary">
          <h1>Результат</h1>
          <p>
            Балл: <b>{score}</b> из <b>{questions.length}</b>
          </p>
          <p>Завершенных попыток на этом устройстве: {attempts}</p>
          <button className="primary-btn" onClick={handleRestart}>
            Пройти заново
          </button>
        </section>

        <section className="card review">
          <h2>Разбор ответов</h2>
          <div className="review-list">
            {questions.map((question) => {
              const userSelected = answers[question.id] || [];
              const states = getAnswerState(question, userSelected);
              const isCorrect = arraysEqualAsSet(userSelected, question.correct);

              return (
                <article className="review-item" key={question.id}>
                  <div className="review-header">
                    <h3>
                      {question.id}. {question.text}
                    </h3>
                    <span className={isCorrect ? "badge right" : "badge wrong"}>
                      {isCorrect ? "Верно" : "Неверно"}
                    </span>
                  </div>

                  <ul className="review-options">
                    {question.options.map((option, idx) => (
                      <li key={option} className={`state-${states[idx]}`}>
                        {option}
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
          <p className="counter">Отвечено: {answeredCount}</p>
        </div>

        <div className="progress-wrap" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>

        <h1>{currentQuestion.text}</h1>
        <p className="type-tip">
          {currentQuestion.type === "multiple"
            ? "Можно выбрать несколько вариантов."
            : "Можно выбрать только один вариант."}
        </p>

        <div className="options">
          {currentQuestion.options.map((option, idx) => {
            const checked = selected.includes(idx);
            return (
              <label
                key={option}
                className={checked ? "option active" : "option"}
                onClick={() => handleOptionToggle(idx)}
              >
                <input
                  type={currentQuestion.type === "multiple" ? "checkbox" : "radio"}
                  name={`question-${currentQuestion.id}`}
                  checked={checked}
                  onChange={() => handleOptionToggle(idx)}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>

        <div className="actions">
          <button
            className="ghost-btn"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
          >
            Назад
          </button>
          <button className="primary-btn" onClick={handleNext} disabled={!selected.length}>
            {isLastQuestion ? "Завершить тест" : "Следующий вопрос"}
          </button>
        </div>
      </section>
    </main>
  );
}
