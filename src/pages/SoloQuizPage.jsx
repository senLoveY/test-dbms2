import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import OptionList from "../components/OptionList.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { useHotkeys } from "../hooks/useHotkeys.js";
import { apiRequest } from "../lib/api.js";
import { formatDate, formatQuestions, pad2 } from "../lib/format.js";
import { useQuiz } from "../lib/quizStore.js";
import { shuffleArray } from "../lib/quiz.js";
import { gradeAnswerDetailed } from "../../lib/gameLogic.js";

function prepareQuestionsSet(sourceQuestions) {
  return shuffleArray(sourceQuestions).map((question) => {
    const options = shuffleArray(
      question.options.map((text, index) => ({ text, isCorrect: question.correct.includes(index) }))
    );
    return {
      id: question.id,
      type: question.type,
      text: question.text,
      options: options.map((option) => option.text),
      correct: options.reduce((acc, option, index) => (option.isCorrect ? [...acc, index] : acc), []),
    };
  });
}

function getAnswerStates(question, selected) {
  const selectedSet = new Set(selected);
  return question.options.map((_, index) => {
    const isSelected = selectedSet.has(index);
    const isCorrect = question.correct.includes(index);
    if (isCorrect && isSelected) return "right-selected";
    if (isCorrect) return "right-missed";
    if (isSelected) return "wrong-selected";
    return "neutral";
  });
}

function verdict(grade) {
  if (grade.isFullyCorrect) return { tone: "good", text: "Верно" };
  if (grade.isPartial) return { tone: "partial", text: "Частично — выбраны не все правильные или есть лишние" };
  return { tone: "bad", text: "Неверно" };
}

function Intro({ quiz, attempts, onStart }) {
  const best = attempts.reduce(
    (acc, attempt) => (attempt.total && attempt.score / attempt.total > acc ? attempt.score / attempt.total : acc),
    -1
  );

  return (
    <PageLayout width="narrow" className="solo-intro">
      <Link to="/me/quizzes" className="link-quiet">
        ← Мои тесты
      </Link>
      <p className="eyebrow">Подготовка</p>
      <h1 className="page-title">{quiz.title}</h1>
      {quiz.description && <p className="lead">{quiz.description}</p>}
      <dl className="facts">
        <div>
          <dt>Вопросов</dt>
          <dd>{quiz.questions.length}</dd>
        </div>
        <div>
          <dt>Попыток</dt>
          <dd>{attempts.length}</dd>
        </div>
        <div>
          <dt>Лучший</dt>
          <dd>{best >= 0 ? `${Math.round(best * 100)}%` : "—"}</dd>
        </div>
      </dl>
      <div className="row">
        <Button variant="primary" size="lg" onClick={onStart} kbd="↵">
          Начать
        </Button>
        <Button variant="ghost" size="lg" to={`/me/quizzes/${quiz.id}/review`}>
          Ответы
        </Button>
      </div>
      <p className="muted hint-keys">
        Отвечайте с клавиатуры: <kbd>1</kbd>–<kbd>9</kbd> — вариант, <kbd>Enter</kbd> — проверить и
        дальше, <kbd>←</kbd> — назад.
      </p>

      {attempts.length > 0 && (
        <section className="section">
          <h2 className="section-title">Последние попытки</h2>
          <ul className="attempts">
            {attempts.slice(0, 6).map((attempt) => {
              const ratio = attempt.total ? attempt.score / attempt.total : 0;
              return (
                <li key={attempt.id}>
                  <span className="attempt-date">{formatDate(attempt.created_at)}</span>
                  <span className="attempt-bar">
                    <span style={{ transform: `scaleX(${ratio})` }} />
                  </span>
                  <span className="attempt-score">
                    {attempt.score}/{attempt.total}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageLayout>
  );
}

function Summary({ quiz, run, answers, onRestart, onRetryWrong }) {
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const graded = run.questions.map((question) => ({
    question,
    selected: answers[question.id] || [],
    grade: gradeAnswerDetailed(question, answers[question.id] || []),
  }));
  const score = graded.filter((item) => item.grade.isFullyCorrect).length;
  const total = graded.length;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const mistakes = graded.filter((item) => !item.grade.isFullyCorrect);
  const shown = onlyMistakes ? mistakes : graded;

  const message =
    percent === 100 ? "Без единой ошибки." : percent >= 80 ? "Почти идеально." : percent >= 50 ? "Неплохо, есть что подтянуть." : "Стоит пройти ещё раз.";

  return (
    <PageLayout width="narrow" className="solo-summary">
      <p className="eyebrow">{run.mode === "mistakes" ? "Работа над ошибками" : "Результат"}</p>
      <div className="score-hero">
        <span className="score-big">
          {score}
          <span className="score-of">/{total}</span>
        </span>
        <span className="score-percent">{percent}%</span>
      </div>
      <p className="lead">{message}</p>
      <div className="meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${score / Math.max(1, total)})` }} />
      </div>

      <div className="row">
        {mistakes.length > 0 && (
          <Button variant="primary" onClick={() => onRetryWrong(mistakes.map((item) => item.question.id))}>
            Повторить ошибки ({mistakes.length})
          </Button>
        )}
        <Button variant={mistakes.length ? "secondary" : "primary"} onClick={onRestart}>
          Пройти заново
        </Button>
        {quiz.status === "published" && (
          <Button variant="accent" to={`/multi/create?quiz=${quiz.id}`}>
            Вызвать на дуэль
          </Button>
        )}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Разбор</h2>
          {mistakes.length > 0 && mistakes.length < total && (
            <button type="button" className="link-btn" onClick={() => setOnlyMistakes((v) => !v)}>
              {onlyMistakes ? "Показать все" : "Только ошибки"}
            </button>
          )}
        </div>
        <ol className="review">
          {shown.map(({ question, selected, grade }) => {
            const v = verdict(grade);
            const states = getAnswerStates(question, selected);
            return (
              <li className="review-item" key={question.id}>
                <div className="review-head">
                  <span className="review-num">{pad2(run.questions.indexOf(question) + 1)}</span>
                  <p className="review-q">{question.text}</p>
                  <span className={`pill pill-${v.tone}`}>
                    {grade.isFullyCorrect ? "верно" : grade.isPartial ? "частично" : "неверно"}
                  </span>
                </div>
                <ul className="review-options">
                  {question.options.map((option, index) => (
                    <li key={index} className={`state-${states[index]}`}>
                      {option}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>
    </PageLayout>
  );
}

export default function SoloQuizPage() {
  const { id } = useParams();
  const { quiz, loading, error } = useQuiz(id);
  const [attempts, setAttempts] = useState([]);
  const [phase, setPhase] = useState("intro");
  const [run, setRun] = useState({ questions: [], mode: "all" });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState({});

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/api/quizzes/${id}/attempt`)
      .then((data) => !cancelled && setAttempts(data.attempts || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const question = run.questions[index];
  const selected = (question && answers[question.id]) || [];
  const isChecked = Boolean(question && checked[question.id]);
  const isLast = index === run.questions.length - 1;
  const grade = useMemo(
    () => (question && isChecked ? gradeAnswerDetailed(question, selected) : null),
    [question, isChecked, selected]
  );

  function begin(questions, mode) {
    setRun({ questions: prepareQuestionsSet(questions), mode });
    setIndex(0);
    setAnswers({});
    setChecked({});
    setPhase("play");
  }

  function toggle(optionIndex) {
    if (!question || isChecked || optionIndex >= question.options.length) return;
    setAnswers((prev) => {
      const current = prev[question.id] || [];
      if (question.type === "single") return { ...prev, [question.id]: [optionIndex] };
      const next = current.includes(optionIndex)
        ? current.filter((item) => item !== optionIndex)
        : [...current, optionIndex].sort((a, b) => a - b);
      return { ...prev, [question.id]: next };
    });
  }

  async function finish() {
    setPhase("done");
    if (run.mode !== "all") return;
    const score = run.questions.filter(
      (q) => gradeAnswerDetailed(q, answers[q.id] || []).isFullyCorrect
    ).length;
    const local = {
      id: `local-${Date.now()}`,
      score,
      total: run.questions.length,
      created_at: new Date().toISOString(),
    };
    setAttempts((prev) => [local, ...prev]);
    apiRequest(`/api/quizzes/${id}/attempt`, {
      method: "POST",
      body: { score, total: run.questions.length },
    }).catch(() => {});
  }

  function primaryAction() {
    if (!question || !selected.length) return;
    if (!isChecked) {
      setChecked((prev) => ({ ...prev, [question.id]: true }));
      return;
    }
    if (isLast) finish();
    else setIndex((value) => value + 1);
  }

  useHotkeys(
    phase === "play"
      ? {
          digit: toggle,
          Enter: primaryAction,
          ArrowRight: () => isChecked && primaryAction(),
          ArrowLeft: () => setIndex((value) => Math.max(0, value - 1)),
        }
      : phase === "intro" && quiz?.questions?.length
        ? { Enter: () => begin(quiz.questions, "all") }
        : {}
  );

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

  if (!quiz.questions?.length) {
    return (
      <PageLayout width="narrow">
        <p className="eyebrow">Подготовка</p>
        <h1 className="page-title">{quiz.title}</h1>
        <p className="lead">В тесте пока нет вопросов.</p>
        <Button variant="primary" to={`/me/quizzes/${quiz.id}/edit`}>
          Открыть редактор
        </Button>
      </PageLayout>
    );
  }

  if (phase === "intro") {
    return <Intro quiz={quiz} attempts={attempts} onStart={() => begin(quiz.questions, "all")} />;
  }

  if (phase === "done") {
    return (
      <Summary
        quiz={quiz}
        run={run}
        answers={answers}
        onRestart={() => begin(quiz.questions, "all")}
        onRetryWrong={(ids) =>
          begin(
            quiz.questions.filter((q) => ids.includes(q.id)),
            "mistakes"
          )
        }
      />
    );
  }

  const v = grade ? verdict(grade) : null;
  const progress = (index + (isChecked ? 1 : 0)) / run.questions.length;

  return (
    <PageLayout width="narrow" className="play">
      <div className="play-top">
        <button type="button" className="link-quiet" onClick={() => setPhase("intro")}>
          ← Выйти
        </button>
        <span className="play-counter">
          {pad2(index + 1)} <span className="muted">/ {pad2(run.questions.length)}</span>
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <div className="question" key={question.id}>
        <p className="question-type">
          {question.type === "multiple" ? "Несколько ответов" : "Один ответ"}
        </p>
        <h1 className="question-text">{question.text}</h1>

        <OptionList
          options={question.options}
          type={question.type}
          selected={selected}
          onToggle={toggle}
          locked={isChecked}
          states={isChecked ? getAnswerStates(question, selected) : null}
        />

        <div className="play-actions">
          <Button
            variant="ghost"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
          >
            Назад
          </Button>
          {v && (
            <p className={`verdict verdict-${v.tone}`} role="status">
              {v.text}
            </p>
          )}
          <Button variant="primary" onClick={primaryAction} disabled={!selected.length} kbd="↵">
            {!isChecked ? "Проверить" : isLast ? "Завершить" : "Дальше"}
          </Button>
        </div>
      </div>
      <p className="muted play-foot">{formatQuestions(run.questions.length)} · {run.mode === "mistakes" ? "только ошибки" : quiz.title}</p>
    </PageLayout>
  );
}
