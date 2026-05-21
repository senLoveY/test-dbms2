import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { questions as sourceQuestions } from "../questions.js";
import { arraysEqualAsSet, shuffleArray } from "../lib/quiz.js";

function prepareQuestionsSet() {
  return shuffleArray(sourceQuestions).map((question) => {
    const optionsWithFlags = question.options.map((optionText, optionIndex) => ({
      text: optionText,
      isCorrect: question.correct.includes(optionIndex),
    }));
    return { ...question, options: shuffleArray(optionsWithFlags) };
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

export default function SoloQuizPage() {
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
  const selected = answers[currentQuestion?.id] || [];
  const currentChecked = Boolean(checkedMap[currentQuestion?.id]);
  const currentAnswerStates = currentQuestion
    ? getAnswerState(currentQuestion, selected)
    : [];
  const currentIsCorrect =
    currentQuestion && currentChecked
      ? isQuestionCorrect(currentQuestion, selected)
      : null;
  const score = useMemo(
    () =>
      questions.reduce((acc, question) => {
        const userSelected = answers[question.id] || [];
        return isQuestionCorrect(question, userSelected) ? acc + 1 : acc;
      }, 0),
    [answers, questions]
  );
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
          <h1>Соло-тест</h1>
          <p className="subtitle">20 вопросов, прохождение по одному вопросу.</p>
          <div className="intro-actions">
            <button
              className="primary-btn intro-action-btn"
              type="button"
              onClick={() => {
                setQuestions(prepareQuestionsSet());
                setStarted(true);
              }}
            >
              Начать
            </button>
            <Link className="ghost-btn intro-action-btn" to="/">
              На главную
            </Link>
          </div>
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
          <button className="primary-btn" type="button" onClick={handleRestart}>
            Пройти заново
          </button>
          <Link className="ghost-btn" to="/answers">
            Открыть ответы
          </Link>
          <Link className="ghost-btn" to="/">
            На главную
          </Link>
        </section>
        <section className="card review">
          <h2>Разбор</h2>
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
                      <li key={option.text} className={`state-${states[idx]}`}>
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
          <Link className="ghost-btn compact-btn" to="/">
            Выход
          </Link>
        </div>
        <div className="progress-wrap" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
        <h1>{currentQuestion.text}</h1>
        <p className="type-tip">
          {currentQuestion.type === "multiple"
            ? "Можно выбрать несколько вариантов."
            : "Один вариант."}
        </p>
        {currentIsCorrect !== null && (
          <p className={currentIsCorrect ? "live-result right" : "live-result wrong"}>
            {currentIsCorrect ? "Верно!" : "Неверно."}
          </p>
        )}
        <div className="options">
          {currentQuestion.options.map((option, idx) => {
            const checked = selected.includes(idx);
            const answerState = currentChecked ? `state-${currentAnswerStates[idx]}` : "";
            return (
              <label
                key={option.text}
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
          <button
            className="ghost-btn"
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
          >
            Назад
          </button>
          <button
            className="check-btn"
            type="button"
            onClick={handleCheckAnswer}
            disabled={!selected.length || currentChecked}
          >
            Ответить
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={handleNext}
            disabled={!selected.length || !currentChecked}
          >
            {isLastQuestion ? "Завершить" : "Далее"}
          </button>
        </div>
      </section>
    </main>
  );
}
