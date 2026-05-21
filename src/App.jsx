import { useMemo, useState } from "react";
import { questions as sourceQuestions } from "./questions";

function arraysEqualAsSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

function shuffleArray(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function prepareQuestionsSet() {
  return shuffleArray(sourceQuestions).map((question) => {
    const optionsWithFlags = question.options.map((optionText, optionIndex) => ({
      text: optionText,
      isCorrect: question.correct.includes(optionIndex),
    }));

    return {
      ...question,
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

export default function App() {
  const [questions, setQuestions] = useState(() => prepareQuestionsSet());
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checkedMap, setCheckedMap] = useState({});
  const [attempts, setAttempts] = useState(
    Number(localStorage.getItem("quizAttempts") || 0)
  );

  const currentQuestion = questions[currentIndex];
  const currentQuestionId = currentQuestion?.id;
  const selected = answers[currentQuestion?.id] || [];
  const currentChecked = Boolean(checkedMap[currentQuestionId]);
  const currentAnswerStates = currentQuestion
    ? getAnswerState(currentQuestion, selected)
    : [];
  const currentIsCorrect =
    currentQuestion && currentChecked
      ? isQuestionCorrect(currentQuestion, selected)
      : null;
  const answeredCount = useMemo(
    () => Object.values(checkedMap).filter(Boolean).length,
    [checkedMap]
  );

  const score = useMemo(() => {
    return questions.reduce((acc, question) => {
      const userSelected = answers[question.id] || [];
      return isQuestionCorrect(question, userSelected) ? acc + 1 : acc;
    }, 0);
  }, [answers, questions]);

  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100);
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

  function handleNext() {
    if (!selected.length || !currentChecked) return;
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
    setCheckedMap({});
    setQuestions(prepareQuestionsSet());
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
          <button
            className="primary-btn"
            onClick={() => {
              setQuestions(prepareQuestionsSet());
              setStarted(true);
            }}
          >
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
              const isCorrect = isQuestionCorrect(question, userSelected);

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
                      <li
                        key={`${question.id}-${idx}-${option.text.slice(0, 16)}`}
                        className={`state-${states[idx]}`}
                      >
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
        {currentIsCorrect !== null && (
          <p className={currentIsCorrect ? "live-result right" : "live-result wrong"}>
            {currentIsCorrect ? "Верно, ответ правильный." : "Пока неверно, проверь ответ."}
          </p>
        )}

        <div className="options">
          {currentQuestion.options.map((option, idx) => {
            const checked = selected.includes(idx);
            const answerState =
              currentChecked ? `state-${currentAnswerStates[idx]}` : "";
            return (
              <label
                key={`${currentQuestion.id}-${idx}-${option.text.slice(0, 16)}`}
                className={checked ? `option active ${answerState}` : `option ${answerState}`}
                onClick={() => handleOptionToggle(idx)}
              >
                <input
                  type={currentQuestion.type === "multiple" ? "checkbox" : "radio"}
                  name={`question-${currentQuestion.id}`}
                  checked={checked}
                  onChange={() => handleOptionToggle(idx)}
                />
                <span>{option.text}</span>
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
          <button
            className="check-btn"
            onClick={handleCheckAnswer}
            disabled={!selected.length || currentChecked}
          >
            Ответить
          </button>
          <button
            className="primary-btn"
            onClick={handleNext}
            disabled={!selected.length || !currentChecked}
          >
            {isLastQuestion ? "Завершить тест" : "Следующий вопрос"}
          </button>
        </div>
      </section>
    </main>
  );
}
