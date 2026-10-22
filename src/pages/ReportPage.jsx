import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import PageLayout, { PageHeader } from "../components/PageLayout.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import { apiRequest } from "../lib/api.js";
import { OPTION_LETTERS, downloadResultsCsv } from "../lib/classroom.js";
import { formatDate, formatTime, plural } from "../lib/format.js";

function QuestionStats({ question, number }) {
  return (
    <article className="rep-q">
      <header className="rep-q-head">
        <span className="rep-q-num">{String(number).padStart(2, "0")}</span>
        <h3 className="rep-q-text">{question.text}</h3>
        <span className={`rep-q-rate ${question.correctPercent < 60 ? "is-low" : ""}`}>
          {question.correctPercent}%
          <small>верно</small>
        </span>
      </header>
      <ul className="rep-opts">
        {question.options.map((option, index) => (
          <li
            key={`${index}-${option.label}`}
            className={`rep-opt ${option.correct ? "is-right" : ""} ${question.trap?.index === index ? "is-trap" : ""}`}
            style={{ "--share": option.percent / 100 }}
          >
            <span className="rep-opt-letter">{OPTION_LETTERS[index]}</span>
            <span className="rep-opt-label">
              {option.label}
              {option.correct && <span className="rep-opt-tag">верный</span>}
              {question.trap?.index === index && <span className="rep-opt-tag rep-opt-tag-trap">частая ошибка</span>}
            </span>
            <span className="rep-opt-count">
              {option.count} <small>({option.percent}%)</small>
            </span>
          </li>
        ))}
      </ul>
      {question.skipped > 0 && (
        <p className="muted small">
          Не ответили: {plural(question.skipped, ["человек", "человека", "человек"])}
        </p>
      )}
    </article>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/api/reports/${id}`)
      .then((data) => setReport(data.report))
      .catch((err) => setError(err.message));
  }, [id]);

  async function remove() {
    const ok = await confirm({
      title: "Удалить отчёт?",
      body: "Статистика урока и список участников будут удалены без возможности восстановления.",
      confirmText: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/reports/${report.id}`, { method: "DELETE" });
      toast("Отчёт удалён");
      navigate("/me/reports");
    } catch (err) {
      toast(err.message, { tone: "bad" });
    }
  }

  if (error) {
    return (
      <PageLayout width="narrow">
        <p className="notice notice-bad">{error}</p>
        <Button variant="secondary" to="/me/reports">
          ← Все отчёты
        </Button>
      </PageLayout>
    );
  }
  if (!report) return <PageSkeleton />;

  const csvPlayers = report.players.map((player) => ({
    username: player.name,
    score: player.score,
    correct_count: player.correct,
  }));
  // the report came over JSON: compare by question number, not by object
  const struggling = new Set(report.struggles.map((q) => q.index));
  const others = report.questions.filter((q) => !struggling.has(q.index));
  const when = formatDate(report.createdAt);

  return (
    <PageLayout width="wide" className="report">
      <PageHeader
        eyebrow={`Урок ${when.includes(":") ? when : `${when}, ${formatTime(report.createdAt)}`}`}
        title={report.quizTitle}
        actions={
          <>
            <Button variant="ghost" to="/me/reports">
              Все отчёты
            </Button>
            {report.players.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => downloadResultsCsv(report.quizTitle, csvPlayers, report.questionsPlayed)}
              >
                Скачать CSV
              </Button>
            )}
          </>
        }
      />

      <dl className="rep-stats">
        <div>
          <dt>Участников</dt>
          <dd>{report.playerCount}</dd>
        </div>
        <div>
          <dt>Вопросов</dt>
          <dd>
            {report.questionsPlayed}
            {report.questionsPlayed < report.questionTotal && <small> из {report.questionTotal}</small>}
          </dd>
        </div>
        <div>
          <dt>Верных в среднем</dt>
          <dd>{report.averagePercent}%</dd>
        </div>
        <div>
          <dt>Трудных вопросов</dt>
          <dd>{report.struggles.length}</dd>
        </div>
      </dl>

      <section className="rep-section">
        <h2 className="section-title">Что повторить</h2>
        {report.struggles.length ? (
          <>
            <p className="muted">
              Меньше 60% верных ответов. Отмечена самая частая ошибка — с неё удобно начать разбор.
            </p>
            {report.struggles.map((question) => (
              <QuestionStats key={question.index} question={question} number={question.index + 1} />
            ))}
          </>
        ) : (
          <p className="muted">На каждый вопрос верно ответили хотя бы 60% класса.</p>
        )}
      </section>

      {others.length > 0 && (
        <details className="rep-section rep-rest">
          <summary className="section-title">Остальные вопросы ({others.length})</summary>
          {others.map((question) => (
            <QuestionStats key={question.index} question={question} number={question.index + 1} />
          ))}
        </details>
      )}

      <section className="rep-section">
        <h2 className="section-title">Участники</h2>
        <ol className="podium">
          {report.players.map((player, index) => (
            <li key={`${index}-${player.name}`} className="podium-row" style={{ "--i": Math.min(index, 8) }}>
              <span className="podium-place">{index + 1}</span>
              <span className="podium-name">
                {player.name}
                <span className="muted small"> · верно {player.correct} из {report.questionsPlayed}</span>
              </span>
              <span className="podium-score">{player.score}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="row">
        <Button variant="ghost" onClick={remove}>
          Удалить отчёт
        </Button>
      </div>
    </PageLayout>
  );
}
