import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import PageLayout, { PageHeader } from "../components/PageLayout.jsx";
import { SkeletonLines } from "../components/Skeleton.jsx";
import { apiRequest } from "../lib/api.js";
import { formatDate, plural } from "../lib/format.js";

export default function ReportsPage() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/api/reports")
      .then((data) => setReports(data.reports || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <PageLayout width="wide">
      <PageHeader
        eyebrow="Класс"
        title="Отчёты уроков"
        lead="После каждой игры в классе: какие вопросы вызвали трудности и какие ошибки были самыми частыми. Хранятся полгода."
      />

      {error && <p className="notice notice-bad">{error}</p>}
      {!reports && !error && <SkeletonLines rows={4} />}

      {reports?.length === 0 && (
        <div className="empty">
          <p className="empty-title">Пока нет отчётов</p>
          <p className="muted">Отчёт появится после первой игры в режиме «Класс».</p>
          <Button variant="primary" to="/multi/create?mode=classroom">
            Играть в классе
          </Button>
        </div>
      )}

      {reports?.length > 0 && (
        <ol className="rows rows-table">
          {reports.map((report, index) => (
            <li className="row-item" key={report.id} style={{ "--i": Math.min(index, 10) }}>
              <span className="row-num">{String(index + 1).padStart(2, "0")}</span>
              <div className="row-main">
                <Link to={`/me/reports/${report.id}`} className="row-title">
                  {report.quizTitle}
                </Link>
                <p className="row-meta">
                  <span>{formatDate(report.createdAt)}</span>
                  <span>{plural(report.playerCount, ["участник", "участника", "участников"])}</span>
                  <span>
                    {report.questionsPlayed} из {report.questionTotal} вопросов
                  </span>
                  <span>в среднем {report.averagePercent}% верных</span>
                  {report.struggleCount > 0 && (
                    <span className="tag tag-warn">
                      {plural(report.struggleCount, ["трудный вопрос", "трудных вопроса", "трудных вопросов"])}
                    </span>
                  )}
                </p>
              </div>
              <div className="row-actions">
                <Button variant="secondary" size="sm" to={`/me/reports/${report.id}`}>
                  Открыть
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PageLayout>
  );
}
