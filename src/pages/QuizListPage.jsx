import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import Menu from "../components/Menu.jsx";
import PageLayout, { PageHeader } from "../components/PageLayout.jsx";
import { SkeletonLines } from "../components/Skeleton.jsx";
import { apiRequest } from "../lib/api.js";
import { formatDate, formatQuestions, plural } from "../lib/format.js";
import { downloadQuizJson } from "../lib/quizTransfer.js";
import { parseImportPayload } from "../../lib/quizModel.js";
import {
  fetchQuiz,
  getQuizListSnapshot,
  prefetchQuiz,
  removeQuiz,
  restoreQuizzes,
  upsertQuiz,
  useQuizzes,
} from "../lib/quizStore.js";

const SEARCH_THRESHOLD = 6;

export default function QuizListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { toast, confirm } = useFeedback();
  const { quizzes, loading, error } = useQuizzes();
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const autoCreated = useRef(false);
  const importInput = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quizzes;
    return quizzes.filter(
      (quiz) =>
        quiz.title.toLowerCase().includes(q) ||
        quiz.tags?.some((tag) => tag.includes(q)) ||
        quiz.description?.toLowerCase().includes(q)
    );
  }, [quizzes, query]);

  async function handleCreate({ fromFile = false } = {}) {
    setBusyId(fromFile ? "generate" : "create");
    try {
      const { quiz } = await apiRequest("/api/quizzes", {
        method: "POST",
        body: { title: "Новый тест" },
      });
      upsertQuiz(quiz, { withQuestions: true });
      navigate(`/me/quizzes/${quiz.id}/edit${fromFile ? "?generate=1" : ""}`);
    } catch (err) {
      toast(err.message, { tone: "bad" });
      setBusyId("");
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let parsed;
    try {
      parsed = parseImportPayload(await file.text());
      if (!parsed.questions.length) throw new Error("В файле нет вопросов");
    } catch (err) {
      toast(err instanceof SyntaxError ? "Это не похоже на JSON" : err.message, { tone: "bad" });
      return;
    }

    setBusyId("import");
    try {
      const { quiz: created } = await apiRequest("/api/quizzes", {
        method: "POST",
        body: { title: parsed.title || file.name.replace(/\.json$/i, "") },
      });
      const { quiz } = await apiRequest(`/api/quizzes/${created.id}`, {
        method: "PUT",
        body: {
          title: created.title,
          description: parsed.description || "",
          tags: parsed.tags || [],
          status: "draft",
          questions: parsed.questions,
        },
      });
      upsertQuiz(quiz, { withQuestions: true });
      navigate(`/me/quizzes/${quiz.id}/edit`);
    } catch (err) {
      toast(err.message, { tone: "bad" });
      setBusyId("");
    }
  }

  async function handleExport(id) {
    try {
      downloadQuizJson(await fetchQuiz(id));
    } catch (err) {
      toast(err.message, { tone: "bad" });
    }
  }

  useEffect(() => {
    if (params.get("new") && !autoCreated.current) {
      autoCreated.current = true;
      setParams({}, { replace: true });
      handleCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function handleDuplicate(id) {
    setBusyId(id);
    try {
      const { quiz } = await apiRequest(`/api/quizzes/${id}/duplicate`, { method: "POST" });
      upsertQuiz(quiz, { withQuestions: true });
      toast("Копия создана");
    } catch (err) {
      toast(err.message, { tone: "bad" });
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(quiz) {
    const ok = await confirm({
      title: `Удалить «${quiz.title}»?`,
      body: "Тест и история попыток будут удалены без возможности восстановления.",
      confirmText: "Удалить",
      tone: "danger",
    });
    if (!ok) return;

    const snapshot = getQuizListSnapshot();
    removeQuiz(quiz.id);
    try {
      await apiRequest(`/api/quizzes/${quiz.id}`, { method: "DELETE" });
      toast("Тест удалён");
    } catch (err) {
      restoreQuizzes(snapshot);
      toast(err.message, { tone: "bad" });
    }
  }

  return (
    <PageLayout width="wide">
      <PageHeader
        eyebrow="Кабинет"
        title="Мои тесты"
        lead={quizzes.length ? plural(quizzes.length, ["тест", "теста", "тестов"]) : null}
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => importInput.current?.click()}
              loading={busyId === "import"}
            >
              Импорт JSON
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCreate({ fromFile: true })}
              loading={busyId === "generate"}
            >
              Из файла
            </Button>
            <Button variant="primary" onClick={() => handleCreate()} loading={busyId === "create"}>
              Новый тест
            </Button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              hidden
            />
          </>
        }
      />

      {quizzes.length >= SEARCH_THRESHOLD && (
        <div className="toolbar">
          <input
            className="input input-search"
            type="search"
            placeholder="Поиск по названию или тегу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск тестов"
          />
          <span className="muted">
            {filtered.length} из {quizzes.length}
          </span>
        </div>
      )}

      {error && <p className="notice notice-bad">{error}</p>}
      {loading && <SkeletonLines rows={4} />}

      {!loading && !error && quizzes.length === 0 && (
        <div className="empty">
          <p className="empty-title">Здесь будут ваши тесты</p>
          <p className="muted">
            Создайте тест вручную, импортируйте JSON или загрузите конспект — модель соберёт
            черновик вопросов.
          </p>
          <Button variant="primary" onClick={() => handleCreate()} loading={busyId === "create"}>
            Создать первый тест
          </Button>
        </div>
      )}

      {filtered.length > 0 && (
        <ol className="rows rows-table">
          {filtered.map((quiz, index) => {
            const playable = quiz.status === "published" && quiz.questionCount > 0;
            return (
              <li
                className={`row-item ${busyId === quiz.id ? "is-busy" : ""}`}
                key={quiz.id}
                style={{ "--i": Math.min(index, 10) }}
                onPointerEnter={() => prefetchQuiz(quiz.id)}
              >
                <span className="row-num">{String(index + 1).padStart(2, "0")}</span>
                <div className="row-main">
                  <Link to={`/me/quizzes/${quiz.id}/edit`} className="row-title">
                    {quiz.title}
                  </Link>
                  {quiz.description && <p className="row-desc">{quiz.description}</p>}
                  <p className="row-meta">
                    <span className={`status status-${quiz.status}`}>
                      {quiz.status === "published" ? "опубликован" : "черновик"}
                    </span>
                    <span>{formatQuestions(quiz.questionCount)}</span>
                    {quiz.updatedAt && <span>изменён {formatDate(quiz.updatedAt)}</span>}
                    {quiz.tags?.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="row-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    to={`/q/${quiz.id}/study`}
                    disabled={!quiz.questionCount}
                  >
                    Соло
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    to={`/multi/create?quiz=${quiz.id}`}
                    disabled={!playable}
                    title={playable ? undefined : "Сначала опубликуйте тест"}
                  >
                    Дуэль
                  </Button>
                  <Menu
                    label={`Действия с тестом «${quiz.title}»`}
                    items={[
                      { label: "Редактировать", onClick: () => navigate(`/me/quizzes/${quiz.id}/edit`) },
                      { label: "Ответы", onClick: () => navigate(`/me/quizzes/${quiz.id}/review`) },
                      { label: "Сделать копию", onClick: () => handleDuplicate(quiz.id) },
                      { label: "Экспорт JSON", onClick: () => handleExport(quiz.id) },
                      { label: "Удалить", tone: "danger", onClick: () => handleDelete(quiz) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!loading && quizzes.length > 0 && filtered.length === 0 && (
        <p className="muted">Ничего не нашлось по запросу «{query}».</p>
      )}
    </PageLayout>
  );
}
