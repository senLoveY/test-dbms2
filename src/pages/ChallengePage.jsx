import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import OptionList from "../components/OptionList.jsx";
import PageLayout from "../components/PageLayout.jsx";
import ShareResultButton from "../components/ShareResultButton.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { useHotkeys } from "../hooks/useHotkeys.js";
import { formatClock } from "../../lib/exam.js";
import { apiRequest } from "../lib/api.js";
import { formatQuestions, pad2 } from "../lib/format.js";
import { getAnswerStates } from "../lib/quiz.js";
import { shareLink } from "../lib/share.js";

const MAX_COMPARE = 6;

function duration(ms) {
  return formatClock((ms || 0) / 1000);
}

function useInvite(view) {
  const { toast } = useFeedback();
  return useCallback(async () => {
    try {
      const result = await shareLink({
        title: `Вызов: ${view.quizTitle}`,
        text: `Пройди вызов «${view.quizTitle}» — ${formatQuestions(view.questionCount)}, посмотрим, кто лучше`,
        url: `${window.location.origin}/c/${view.id}`,
      });
      if (result === "copied") toast("Ссылка на вызов скопирована");
    } catch {
      toast("Не получилось поделиться", { tone: "bad" });
    }
  }, [view, toast]);
}

function Leaderboard({ view, withMarks = false }) {
  if (!view.leaderboard.length) return null;
  const shown = withMarks ? view.leaderboard.slice(0, MAX_COMPARE) : view.leaderboard;

  return (
    <section className="section">
      <h2 className="section-title">
        Рейтинг <span className="count">{view.leaderboard.length}</span>
      </h2>
      <ol className="podium">
        {view.leaderboard.map((player, index) => (
          <li key={player.userId} className={`podium-row ${index === 0 ? "is-first" : ""}`} style={{ "--i": index }}>
            <span className="podium-place">{index + 1}</span>
            <span className="podium-name">
              {player.username}
              {player.isMe && <span className="vs-you">вы</span>}
              {player.isCreator && <span className="pill pill-quiet challenge-author">автор</span>}
              <span className="podium-time">{duration(player.durationMs)}</span>
            </span>
            <span className="podium-score">
              {player.correct}
              <span className="score-of">/{player.total}</span>
            </span>
          </li>
        ))}
      </ol>

      {withMarks && shown.length > 1 && (
        <div className="compare" role="table" aria-label="Ответы по вопросам" style={{ "--cols": shown.length }}>
          <div className="compare-row compare-head" role="row">
            <span role="columnheader">Вопрос</span>
            {shown.map((player) => (
              <span key={player.userId} role="columnheader" className="compare-name" title={player.username}>
                {player.isMe ? "вы" : player.username}
              </span>
            ))}
          </div>
          {Array.from({ length: view.questionCount }, (_, question) => (
            <div className="compare-row" role="row" key={question}>
              <span role="rowheader" className="compare-num">
                {pad2(question + 1)}
              </span>
              {shown.map((player) => {
                const ok = player.marks?.[question];
                return (
                  <span key={player.userId} role="cell" className={`mark ${ok ? "mark-ok" : "mark-bad"}`}>
                    <span className="sr-only">{ok ? "верно" : "неверно"}</span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Intro({ view, onStart, starting }) {
  const invite = useInvite(view);
  return (
    <PageLayout width="narrow" className="challenge">
      <p className="eyebrow">
        {view.isCreator ? "Ваш вызов" : <>Вызов от <span className="eyebrow-name">{view.creator}</span></>}
      </p>
      <h1 className="page-title">{view.quizTitle}</h1>
      <p className="lead">
        {formatQuestions(view.questionCount)}, по {view.secondsPerQuestion} секунд на каждый. Без подсказок — ответы
        и сравнение после финиша. Пройти можно один раз.
      </p>
      <div className="row">
        <Button variant="accent" size="lg" onClick={onStart} loading={starting} kbd="↵">
          Начать
        </Button>
        <Button variant="ghost" size="lg" onClick={invite}>
          Позвать друзей
        </Button>
      </div>
      <Leaderboard view={view} />
    </PageLayout>
  );
}

function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, (deadline - now) / 1000);
}

function Play({ view, onSubmit }) {
  const questions = view.questions;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => questions.map(() => []));
  const [submitting, setSubmitting] = useState(false);
  const [deadline, setDeadline] = useState(() => Date.now() + view.secondsPerQuestion * 1000);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const question = questions[index];
  const selected = answers[index];
  const isLast = index === questions.length - 1;
  const secondsLeft = useCountdown(deadline);

  // One advance per transition; cleared once the index actually changes.
  const advancingRef = useRef(false);
  // The question whose deadline already auto-fired, so the timer never fires twice.
  const timedOutIndexRef = useRef(-1);

  const next = useCallback(async () => {
    if (submitting || advancingRef.current) return;
    if (!isLast) {
      advancingRef.current = true;
      setIndex((value) => value + 1);
      setDeadline(Date.now() + view.secondsPerQuestion * 1000);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(answersRef.current);
    } catch {
      // let the player retry from the button; the timer won't re-fire for this question
      setSubmitting(false);
    }
  }, [isLast, submitting, onSubmit, view.secondsPerQuestion]);

  useEffect(() => {
    advancingRef.current = false;
  }, [index]);

  // Time's up: keep whatever is selected and move on — exactly once per question,
  // so a failed final submit can't spin the effect into a retry loop.
  useEffect(() => {
    if (secondsLeft > 0 || timedOutIndexRef.current === index) return;
    timedOutIndexRef.current = index;
    next();
  }, [secondsLeft, index, next]);

  function toggle(option) {
    if (option >= question.options.length) return;
    setAnswers((prev) =>
      prev.map((current, i) => {
        if (i !== index) return current;
        if (question.type === "single") return [option];
        return current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
      })
    );
  }

  useHotkeys({ digit: toggle, Enter: next });

  const total = view.secondsPerQuestion * 1000;
  return (
    <PageLayout width="narrow" className="play">
      <div className="play-top">
        <span className="play-counter">
          {pad2(index + 1)} <span className="muted">/ {pad2(questions.length)}</span>
        </span>
        <span className={`timer ${secondsLeft <= 5 ? "is-urgent" : ""}`}>{formatClock(secondsLeft)}</span>
      </div>
      <div className={`countdown ${secondsLeft <= 5 ? "countdown-urgent" : ""}`} aria-hidden="true">
        <span key={index} style={{ "--d": `${total}ms`, "--delay": `-${total - secondsLeft * 1000}ms` }} />
      </div>

      <div className="question" key={index}>
        <p className="question-type">{question.type === "multiple" ? "Несколько ответов" : "Один ответ"}</p>
        <h1 className="question-text">{question.text}</h1>
        <OptionList options={question.options} type={question.type} selected={selected} onToggle={toggle} />
        <div className="play-actions">
          <Button variant="primary" onClick={next} loading={submitting} kbd="↵">
            {isLast ? "Завершить" : selected.length ? "Дальше" : "Пропустить"}
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}

function Results({ view }) {
  const invite = useInvite(view);
  const { correct, total, durationMs } = view.mine;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const place = view.leaderboard.findIndex((player) => player.isMe) + 1;

  return (
    <PageLayout width="narrow" className="challenge challenge-results">
      <p className="eyebrow">Вызов · {view.quizTitle}</p>
      <div className="score-hero">
        <span className="score-big">
          {correct}
          <span className="score-of">/{total}</span>
        </span>
        <span className="score-percent">{percent}%</span>
      </div>
      <p className="lead">
        Время {duration(durationMs)}
        {view.leaderboard.length > 1 ? ` · ${place}-е место из ${view.leaderboard.length}` : " · вы первый — зовите остальных"}
      </p>

      <div className="row">
        <Button variant="accent" onClick={invite}>
          Позвать друзей
        </Button>
        <ShareResultButton
          card={{
            kind: "Вызов",
            title: view.quizTitle,
            score: correct,
            total,
            stamp: `${percent}%`,
            caption: `время ${duration(durationMs)}${place ? ` · ${place}-е место` : ""}`,
          }}
        />
        {view.quizId && (
          <Button variant="ghost" to={`/q/${view.quizId}`}>
            К тесту
          </Button>
        )}
      </div>

      <Leaderboard view={view} withMarks />

      <section className="section">
        <h2 className="section-title">Разбор</h2>
        <ol className="review">
          {view.review.map((question, index) => (
            <li className="review-item" key={index}>
              <div className="review-head">
                <span className="review-num">{pad2(index + 1)}</span>
                <p className="review-q">{question.text}</p>
                <span className={`pill pill-${question.ok ? "good" : "bad"}`}>{question.ok ? "верно" : "неверно"}</span>
              </div>
              <ul className="review-options">
                {question.options.map((option, optionIndex) => (
                  <li key={optionIndex} className={`state-${getAnswerStates(question, question.selected)[optionIndex]}`}>
                    {option}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </PageLayout>
  );
}

export default function ChallengePage() {
  const { id } = useParams();
  const { toast } = useFeedback();
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/api/challenges/${id}`)
      .then((data) => !cancelled && setView(data.challenge))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function start() {
    setStarting(true);
    try {
      const data = await apiRequest(`/api/challenges/${id}/start`, { method: "POST" });
      setView(data.challenge);
    } catch (err) {
      toast(err.message, { tone: "bad" });
    } finally {
      setStarting(false);
    }
  }

  const submit = useCallback(
    async (answers) => {
      try {
        const data = await apiRequest(`/api/challenges/${id}/submit`, { method: "POST", body: { answers } });
        setView(data.challenge);
      } catch (err) {
        toast(err.message, { tone: "bad" });
        throw err;
      }
    },
    [id, toast]
  );

  useHotkeys(view?.status === "new" && !starting ? { Enter: start } : {});

  if (error) {
    return (
      <PageLayout width="narrow">
        <p className="eyebrow">Вызов</p>
        <h1 className="page-title">Вызов не найден</h1>
        <p className="lead">{error}</p>
        <div className="row">
          <Button variant="primary" to="/">
            На главную
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (!view) return <PageSkeleton />;
  if (view.status === "finished") return <Results view={view} />;
  if (view.status === "started") return <Play view={view} onSubmit={submit} />;
  return <Intro view={view} onStart={start} starting={starting} />;
}

