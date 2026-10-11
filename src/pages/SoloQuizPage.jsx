import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import ChallengeButton from "../components/ChallengeButton.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import ShareResultButton from "../components/ShareResultButton.jsx";
import OptionList from "../components/OptionList.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { useHotkeys } from "../hooks/useHotkeys.js";
import { apiRequest } from "../lib/api.js";
import { formatDate, formatQuestions, pad2 } from "../lib/format.js";
import { useQuiz } from "../lib/quizStore.js";
import { getAnswerStates, shuffleArray } from "../lib/quiz.js";
import { gradeAnswerDetailed } from "../../lib/gameLogic.js";
import { buildAttemptAnswers, pickReviewQuestions, summarizeProgress } from "../../lib/progress.js";
import { examDurationSec, examGrade, formatClock } from "../../lib/exam.js";

const MODE_LABEL = {
  all: "Результат",
  mistakes: "Работа над ошибками",
  review: "Слабые места",
  exam: "Экзамен",
};

const PROGRESS_GROUPS = [
  { key: "learned", label: "Выучено" },
  { key: "learning", label: "В процессе" },
  { key: "weak", label: "Слабые" },
  { key: "new", label: "Новые" },
];

function ProgressPanel({ summary, reviewCount, onReview }) {
  const done = summary.learned === summary.total;
  return (
    <section className="progress-panel" aria-label="Прогресс по вопросам">
      <div className="stack-bar" aria-hidden="true">
        {PROGRESS_GROUPS.map(({ key }) =>
          summary[key] ? (
            <span key={key} className={`stack-${key}`} style={{ flexGrow: summary[key] }} />
          ) : null
        )}
      </div>
      <ul className="stack-legend">
        {PROGRESS_GROUPS.map(({ key, label }) => (
          <li key={key} className={`legend-${key}`}>
            <span className="legend-swatch" aria-hidden="true" />
            {label}
            <span className="legend-count">{summary[key]}</span>
          </li>
        ))}
      </ul>
      {done ? (
        <p className="progress-done">Все вопросы выучены — три верных ответа подряд на каждый.</p>
      ) : (
        <Button variant="accent" onClick={onReview} disabled={!reviewCount}>
          {summary.weak ? "Повторить слабые места" : "Учить дальше"} ({reviewCount})
        </Button>
      )}
    </section>
  );
}

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

function verdict(grade) {
  if (grade.isFullyCorrect) return { tone: "good", text: "Верно" };
  if (grade.isPartial) return { tone: "partial", text: "Частично — выбраны не все правильные или есть лишние" };
  return { tone: "bad", text: "Неверно" };
}

function Intro({ quiz, attempts, progress, onStart, onExam, onReview }) {
  const best = attempts.reduce(
    (acc, attempt) => (attempt.total && attempt.score / attempt.total > acc ? attempt.score / attempt.total : acc),
    -1
  );

  const summary = progress ? summarizeProgress(quiz.questions, progress) : null;
  const reviewQueue = progress ? pickReviewQuestions(quiz.questions, progress) : [];

  return (
    <PageLayout width="narrow" className="solo-intro">
      {quiz.isOwner === false ? (
        <Link to={`/q/${quiz.id}`} className="link-quiet">
          ← К тесту
        </Link>
      ) : (
        <Link to="/me/quizzes" className="link-quiet">
          ← Мои тесты
        </Link>
      )}
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
        <Button variant="secondary" size="lg" onClick={onExam}>
          Экзамен
        </Button>
      </div>
      <p className="muted small exam-note">
        Экзамен — {formatQuestions(quiz.questions.length)} за {examDurationSec(quiz.questions.length) / 60} мин, без
        подсказок до конца, в итоге оценка.
      </p>
      <div className="row row-tight intro-extra">
        <ChallengeButton quiz={quiz} variant="ghost" />
        {quiz.isOwner !== false && (
          <Button variant="ghost" to={`/me/quizzes/${quiz.id}/review`}>
            Ответы
          </Button>
        )}
      </div>
      <p className="muted hint-keys">
        Отвечайте с клавиатуры: <kbd>1</kbd>–<kbd>9</kbd> — вариант, <kbd>Enter</kbd> — проверить и
        дальше, <kbd>←</kbd> — назад.
      </p>

      {summary && summary.total > 0 && summary.new < summary.total && (
        <section className="section">
          <h2 className="section-title">Прогресс</h2>
          <ProgressPanel
            summary={summary}
            reviewCount={reviewQueue.length}
            onReview={() => onReview(reviewQueue)}
          />
        </section>
      )}

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

function ExamPlay({ quiz, run, answers, index, setIndex, toggle, onSubmit }) {
  const { confirm } = useFeedback();
  const [now, setNow] = useState(Date.now());
  const question = run.questions[index];
  const selected = answers[question.id] || [];
  const left = (run.deadline - now) / 1000;
  const unanswered = run.questions.filter((q) => !(answers[q.id] || []).length).length;
  const isLast = index === run.questions.length - 1;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (left <= 0) onSubmit();
  }, [left, onSubmit]);

  async function handIn() {
    if (unanswered) {
      const ok = await confirm({
        title: "Сдать работу?",
        body: `Без ответа ${formatQuestions(unanswered)}. Они будут засчитаны как неверные.`,
        confirmText: "Сдать",
      });
      if (!ok) return;
    }
    onSubmit();
  }

  return (
    <PageLayout width="narrow" className="play exam">
      <div className="play-top">
        <span className="play-counter">
          {pad2(index + 1)} <span className="muted">/ {pad2(run.questions.length)}</span>
        </span>
        <span className={`timer ${left <= 60 ? "is-urgent" : ""}`} aria-label="Осталось времени">
          {formatClock(left)}
        </span>
      </div>
      <nav className="exam-nav" aria-label="Вопросы">
        {run.questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            className={`exam-cell ${i === index ? "is-current" : ""} ${(answers[q.id] || []).length ? "is-answered" : ""}`}
            onClick={() => setIndex(i)}
            aria-label={`Вопрос ${i + 1}${(answers[q.id] || []).length ? ", есть ответ" : ""}`}
            aria-current={i === index ? "step" : undefined}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <div className="question" key={question.id}>
        <p className="question-type">{question.type === "multiple" ? "Несколько ответов" : "Один ответ"}</p>
        <h1 className="question-text">{question.text}</h1>
        <OptionList options={question.options} type={question.type} selected={selected} onToggle={toggle} />
        <div className="play-actions">
          <Button variant="ghost" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
            Назад
          </Button>
          {isLast ? (
            <Button variant="accent" onClick={handIn}>
              Сдать работу
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setIndex(index + 1)} kbd="↵">
              Дальше
            </Button>
          )}
        </div>
      </div>
      <p className="muted play-foot">
        {quiz.title} · отвечено {run.questions.length - unanswered} из {run.questions.length}
        {!isLast && (
          <>
            {" · "}
            <button type="button" className="link-btn" onClick={handIn}>
              сдать досрочно
            </button>
          </>
        )}
      </p>
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

  const exam = run.mode === "exam" ? examGrade(score, total) : null;
  const spent = run.finishedAt && run.startedAt ? formatClock((run.finishedAt - run.startedAt) / 1000) : "";
  const message = exam
    ? `Оценка «${exam.label}»${spent ? `, время ${spent}` : ""}.`
    : percent === 100 ? "Без единой ошибки." : percent >= 80 ? "Почти идеально." : percent >= 50 ? "Неплохо, есть что подтянуть." : "Стоит пройти ещё раз.";

  return (
    <PageLayout width="narrow" className="solo-summary">
      <p className="eyebrow">{MODE_LABEL[run.mode]}</p>
      <div className="score-hero">
        <span className="score-big">
          {score}
          <span className="score-of">/{total}</span>
        </span>
        {exam ? (
          <span className="score-percent score-grade" title={exam.label}>
            {exam.grade}
          </span>
        ) : (
          <span className="score-percent">{percent}%</span>
        )}
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
          <Button
            variant="accent"
            to={quiz.isOwner === false ? `/q/${quiz.id}` : `/multi/create?quiz=${quiz.id}`}
          >
            Вызвать на дуэль
          </Button>
        )}
      </div>
      <div className="row row-tight">
        <ShareResultButton
          card={{
            kind: MODE_LABEL[run.mode],
            title: quiz.title,
            score,
            total,
            stamp: exam ? String(exam.grade) : `${percent}%`,
            caption: exam ? `${exam.label}${spent ? ` · ${spent}` : ""}` : message,
          }}
        />
        <ChallengeButton quiz={quiz} variant="ghost" />
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
  const [questionProgress, setQuestionProgress] = useState(null);
  const [phase, setPhase] = useState("intro");
  const [run, setRun] = useState({ questions: [], mode: "all" });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState({});

  const loadProgress = useCallback(
    () =>
      apiRequest(`/api/quizzes/${id}/progress`)
        .then((data) => setQuestionProgress(data.progress || {}))
        .catch(() => {}),
    [id]
  );

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/api/quizzes/${id}/attempt`)
      .then((data) => !cancelled && setAttempts(data.attempts || []))
      .catch(() => {});
    loadProgress();
    return () => {
      cancelled = true;
    };
  }, [id, loadProgress]);

  const question = run.questions[index];
  const selected = (question && answers[question.id]) || [];
  const isChecked = Boolean(question && checked[question.id]);
  const isLast = index === run.questions.length - 1;
  const grade = useMemo(
    () => (question && isChecked ? gradeAnswerDetailed(question, selected) : null),
    [question, isChecked, selected]
  );

  function begin(questions, mode) {
    const startedAt = Date.now();
    setRun({
      questions: prepareQuestionsSet(questions),
      mode,
      startedAt,
      deadline: mode === "exam" ? startedAt + examDurationSec(questions.length) * 1000 : null,
    });
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
    if (phase !== "play") return;
    setPhase("done");
    setRun((prev) => ({ ...prev, finishedAt: Date.now() }));
    const isCorrect = (q) => gradeAnswerDetailed(q, answers[q.id] || []).isFullyCorrect;
    const score = run.questions.filter(isCorrect).length;
    // full runs and exams count as attempts; mistakes / weak-spot drills are practice
    const practice = run.mode !== "all" && run.mode !== "exam";
    if (!practice) {
      const local = {
        id: `local-${Date.now()}`,
        score,
        total: run.questions.length,
        created_at: new Date().toISOString(),
      };
      setAttempts((prev) => [local, ...prev]);
    }
    // Every run feeds per-question progress; only full runs count as attempts.
    apiRequest(`/api/quizzes/${id}/attempt`, {
      method: "POST",
      body: {
        score,
        total: run.questions.length,
        practice,
        answers: buildAttemptAnswers(run.questions, isCorrect),
      },
    })
      .then(loadProgress)
      .catch(() => {});
  }

  // the exam timer calls the latest finish(), not the one from when it started
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const submitExam = useCallback(() => finishRef.current(), []);

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
    phase === "play" && run.mode === "exam"
      ? {
          digit: toggle,
          Enter: () => setIndex((value) => Math.min(run.questions.length - 1, value + 1)),
          ArrowRight: () => setIndex((value) => Math.min(run.questions.length - 1, value + 1)),
          ArrowLeft: () => setIndex((value) => Math.max(0, value - 1)),
        }
      : phase === "play"
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
    return (
      <Intro
        quiz={quiz}
        attempts={attempts}
        progress={questionProgress}
        onStart={() => begin(quiz.questions, "all")}
        onExam={() => begin(quiz.questions, "exam")}
        onReview={(questions) => begin(questions, "review")}
      />
    );
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

  if (run.mode === "exam") {
    return (
      <ExamPlay
        quiz={quiz}
        run={run}
        answers={answers}
        index={index}
        setIndex={setIndex}
        toggle={toggle}
        onSubmit={submitExam}
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
      <p className="muted play-foot">{formatQuestions(run.questions.length)} · {run.mode === "mistakes" ? "только ошибки" : run.mode === "review" ? "слабые места" : quiz.title}</p>
    </PageLayout>
  );
}
