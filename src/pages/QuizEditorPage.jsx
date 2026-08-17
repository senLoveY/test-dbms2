import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AuthGate from "../components/AuthGate.jsx";
import Button from "../components/Button.jsx";
import PageLayout from "../components/PageLayout.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest } from "../lib/api.js";
import {
  QUIZ_LIMITS,
  createEmptyQuestion,
  getPublishErrors,
  normalizeQuestion,
  parseImportPayload,
  validateQuestion,
} from "../../lib/quizModel.js";

function OptionEditor({ question, index, onChange }) {
  function updateOption(optionIndex, text) {
    const options = question.options.map((option, i) =>
      i === optionIndex ? text : option
    );
    onChange(index, { ...question, options });
  }

  function toggleCorrect(optionIndex) {
    if (question.type === "single") {
      onChange(index, { ...question, correct: [optionIndex] });
      return;
    }
    const has = question.correct.includes(optionIndex);
    const correct = has
      ? question.correct.filter((item) => item !== optionIndex)
      : [...question.correct, optionIndex].sort((a, b) => a - b);
    onChange(index, { ...question, correct });
  }

  function addOption() {
    if (question.options.length >= QUIZ_LIMITS.maxOptions) return;
    onChange(index, { ...question, options: [...question.options, ""] });
  }

  function removeOption(optionIndex) {
    if (question.options.length <= QUIZ_LIMITS.minOptions) return;
    const options = question.options.filter((_, i) => i !== optionIndex);
    const correct = question.correct
      .filter((item) => item !== optionIndex)
      .map((item) => (item > optionIndex ? item - 1 : item));
    onChange(index, { ...question, options, correct });
  }

  return (
    <div className="editor-options">
      {question.options.map((option, optionIndex) => (
        <div className="editor-option" key={optionIndex}>
          <label className="editor-correct">
            <input
              type={question.type === "single" ? "radio" : "checkbox"}
              name={`correct-${index}`}
              checked={question.correct.includes(optionIndex)}
              onChange={() => toggleCorrect(optionIndex)}
            />
          </label>
          <input
            value={option}
            onChange={(e) => updateOption(optionIndex, e.target.value)}
            placeholder={`Вариант ${optionIndex + 1}`}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => removeOption(optionIndex)}
            disabled={question.options.length <= QUIZ_LIMITS.minOptions}
            aria-label="Удалить вариант"
          >
            ×
          </button>
        </div>
      ))}
      {question.options.length < QUIZ_LIMITS.maxOptions && (
        <Button variant="secondary" onClick={addOption}>
          Добавить вариант
        </Button>
      )}
    </div>
  );
}

export default function QuizEditorPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("draft");
  const [questions, setQuestions] = useState([createEmptyQuestion()]);
  const [importText, setImportText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user || !id) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const { quiz } = await apiRequest(`/api/quizzes/${id}`);
        if (cancelled) return;
        setTitle(quiz.title);
        setDescription(quiz.description || "");
        setTags((quiz.tags || []).join(", "));
        setStatus(quiz.status);
        setQuestions(
          quiz.questions?.length
            ? quiz.questions.map((question) => normalizeQuestion(question))
            : [createEmptyQuestion()]
        );
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  const publishErrors = useMemo(() => getPublishErrors(questions), [questions]);

  if (authLoading || loading) {
    return (
      <PageLayout className="intro">
        <p className="muted">Загрузка...</p>
      </PageLayout>
    );
  }

  if (!user) {
    return <AuthGate message="Войдите, чтобы редактировать тесты." />;
  }

  function updateQuestion(index, next) {
    setQuestions((prev) => prev.map((question, i) => (i === index ? next : question)));
  }

  function moveQuestion(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    setQuestions((prev) => {
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  function payload(nextStatus = status) {
    return {
      title,
      description,
      tags,
      status: nextStatus,
      questions,
    };
  }

  async function save(nextStatus = status) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { quiz } = await apiRequest(`/api/quizzes/${id}`, {
        method: "PUT",
        body: payload(nextStatus),
      });
      setStatus(quiz.status);
      setNotice(quiz.status === "published" ? "Опубликовано" : "Черновик сохранён");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleImport() {
    setError("");
    try {
      const parsed = parseImportPayload(importText);
      if (parsed.title && (!title || title === "Новый тест")) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.tags?.length) setTags(parsed.tags.join(", "));
      if (!parsed.questions.length) throw new Error("В JSON нет вопросов");
      setQuestions(parsed.questions);
      setImportText("");
      setNotice(`Импортировано вопросов: ${parsed.questions.length}`);
    } catch (err) {
      setError(err.message || "Не удалось импортировать JSON");
    }
  }

  return (
    <PageLayout className="quiz-editor" wide centered={false}>
      <header className="cabinet-header">
        <div>
          <p className="chip">Редактор</p>
          <h1>Тест</h1>
        </div>
        <span className={`status-badge status-${status}`}>
          {status === "published" ? "Опубликован" : "Черновик"}
        </span>
      </header>

      {error && <p className="live-result wrong">{error}</p>}
      {notice && <p className="live-result right">{notice}</p>}

      <form
        className="auth-form editor-meta"
        onSubmit={(event) => {
          event.preventDefault();
          save("draft");
        }}
      >
        <label>
          Название
          <input
            value={title}
            maxLength={QUIZ_LIMITS.maxTitle}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label>
          Описание
          <textarea
            value={description}
            maxLength={QUIZ_LIMITS.maxDescription}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <label>
          Теги через запятую
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="алгебра, контрольная"
          />
        </label>
      </form>

      <section className="import-box">
        <h2>Импорт JSON</h2>
        <p className="muted">
          Массив вопросов или объект с полями title и questions: type, text, options,
          correct.
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={5}
          placeholder='[{"type":"single","text":"...","options":["A","B"],"correct":[0]}]'
        />
        <Button variant="secondary" onClick={handleImport} disabled={!importText.trim()}>
          Импортировать
        </Button>
      </section>

      <section className="editor-questions">
        <div className="cabinet-header">
          <h2>Вопросы ({questions.length})</h2>
          <Button
            variant="secondary"
            onClick={() => {
              if (questions.length >= QUIZ_LIMITS.maxQuestions) return;
              setQuestions((prev) => [...prev, createEmptyQuestion()]);
            }}
            disabled={questions.length >= QUIZ_LIMITS.maxQuestions}
          >
            Добавить вопрос
          </Button>
        </div>

        {questions.map((question, index) => {
          const errors = validateQuestion(question);
          return (
            <article className="editor-question" key={index}>
              <div className="editor-question-head">
                <strong>Вопрос {index + 1}</strong>
                <div className="btn-row">
                  <Button
                    variant="secondary"
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === questions.length - 1}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setQuestions((prev) =>
                        prev.length === 1
                          ? [createEmptyQuestion()]
                          : prev.filter((_, i) => i !== index)
                      )
                    }
                  >
                    Удалить
                  </Button>
                </div>
              </div>
              {errors.length > 0 && (
                <p className="muted">{errors.join(" · ")}</p>
              )}
              <label className="setting-row">
                <span>Тип</span>
                <select
                  value={question.type}
                  onChange={(e) =>
                    updateQuestion(index, {
                      ...question,
                      type: e.target.value,
                      correct:
                        e.target.value === "single"
                          ? question.correct.slice(0, 1)
                          : question.correct,
                    })
                  }
                >
                  <option value="single">Один ответ</option>
                  <option value="multiple">Несколько ответов</option>
                </select>
              </label>
              <label className="setting-row">
                <span>Текст</span>
                <textarea
                  value={question.text}
                  onChange={(e) =>
                    updateQuestion(index, { ...question, text: e.target.value })
                  }
                  rows={3}
                />
              </label>
              <p className="muted">Отметьте правильные варианты слева.</p>
              <OptionEditor question={question} index={index} onChange={updateQuestion} />
            </article>
          );
        })}
      </section>

      <div className="editor-actions">
        <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить черновик"}
        </Button>
        <Button
          variant="primary"
          onClick={() => save("published")}
          disabled={saving || publishErrors.length > 0}
        >
          Опубликовать
        </Button>
        <Button variant="accent" to={`/q/${id}/study`}>
          Соло
        </Button>
        <Button variant="secondary" to={`/me/quizzes/${id}/review`}>
          Справочник
        </Button>
        <Button variant="secondary" to="/me/quizzes">
          К списку
        </Button>
      </div>
      {publishErrors.length > 0 && (
        <p className="muted">Чтобы опубликовать: {publishErrors[0]}</p>
      )}
    </PageLayout>
  );
}
