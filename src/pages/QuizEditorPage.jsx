import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AutoTextarea from "../components/AutoTextarea.jsx";
import Button from "../components/Button.jsx";
import { useFeedback } from "../components/Feedback.jsx";
import Modal from "../components/Modal.jsx";
import PageLayout from "../components/PageLayout.jsx";
import QuestionCard from "../components/QuestionCard.jsx";
import Segmented from "../components/Segmented.jsx";
import { PageSkeleton } from "../components/Skeleton.jsx";
import Switch from "../components/Switch.jsx";
import { apiRequest } from "../lib/api.js";
import { SOURCE_FILE_ACCEPT, extractFileText } from "../lib/fileText.js";
import { formatQuestions, formatTime } from "../lib/format.js";
import { fetchQuiz, getCachedQuiz, upsertQuiz } from "../lib/quizStore.js";
import { downloadQuizJson } from "../lib/quizTransfer.js";
import {
  GENERATE_LIMITS,
  QUIZ_LIMITS,
  createEmptyQuestion,
  normalizeQuestion,
  parseImportPayload,
  validateQuestion,
} from "../../lib/quizModel.js";

const AUTOSAVE_DELAY_MS = 1200;
const MOD_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const DEFAULT_TITLES = ["", "Новый тест", "Без названия"];

let keySeed = 0;
function withKey(question) {
  keySeed += 1;
  return { ...question, _key: `q${keySeed}` };
}

function isBlankQuestion(question) {
  return !question.text?.trim() && (question.options || []).every((option) => !String(option).trim());
}

function toQuestions(list) {
  return list?.length
    ? list.map((question) => withKey(normalizeQuestion(question)))
    : [withKey(createEmptyQuestion())];
}

function GenerateDialog({ open, onClose, quizId, onGenerated }) {
  const [source, setSource] = useState("");
  const [count, setCount] = useState(5);
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [clipped, setClipped] = useState(false);
  const [error, setError] = useState("");

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setReading(true);
    try {
      const text = await extractFileText(file);
      setSource(text.slice(0, GENERATE_LIMITS.maxSourceChars));
      setClipped(text.length > GENERATE_LIMITS.maxSourceChars);
      setFileName(file.name);
    } catch (err) {
      setError(err.message || "Не удалось прочитать файл");
    } finally {
      setReading(false);
    }
  }

  async function handleGenerate() {
    setBusy(true);
    setError("");
    try {
      const data = await apiRequest(`/api/quizzes/${quizId}/generate`, {
        method: "POST",
        body: { source, count, allowMultiple },
      });
      onGenerated(data);
      setSource("");
      setFileName("");
      setClipped(false);
      onClose();
    } catch (err) {
      setError(err.message || "Не удалось сгенерировать вопросы");
    } finally {
      setBusy(false);
    }
  }

  const tooShort = source.trim().length < 40;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Вопросы из материала" wide>
      <p className="muted">
        Загрузите конспект или методичку (PDF, DOCX, TXT) либо вставьте текст. Модель предложит
        черновик — правильные ответы стоит проверить перед публикацией.
      </p>
      <label className={`link-btn file-btn ${busy || reading ? "is-disabled" : ""}`}>
        {reading ? "Читаем файл…" : fileName ? `Файл: ${fileName} — выбрать другой` : "Выбрать файл"}
        <input
          type="file"
          accept={SOURCE_FILE_ACCEPT}
          onChange={readFile}
          disabled={busy || reading}
          hidden
        />
      </label>
      <AutoTextarea
        className="input input-capped"
        minRows={8}
        value={source}
        maxLength={GENERATE_LIMITS.maxSourceChars}
        onChange={(e) => setSource(e.target.value)}
        placeholder="…или вставьте учебный текст"
        disabled={busy || reading}
        autoFocus
      />
      <div className="dialog-grid">
        <div className="field">
          <span className="field-label">Сколько вопросов</span>
          <Segmented
            label="Сколько вопросов"
            value={count}
            options={[3, 5, 10].map((n) => ({ value: n, label: String(n) }))}
            onChange={(value) => setCount(Number(value))}
            disabled={busy}
          />
        </div>
        <Switch
          label="Несколько правильных"
          hint="Разрешить вопросы с выбором нескольких ответов"
          checked={allowMultiple}
          onChange={setAllowMultiple}
          disabled={busy}
        />
      </div>
      <p className="counter-hint">
        {source.length.toLocaleString("ru-RU")} / {GENERATE_LIMITS.maxSourceChars.toLocaleString("ru-RU")}
        {clipped && " — файл длинный, взято начало"}
      </p>
      {busy && (
        <div className="working" role="status">
          <span className="working-bar" />
          Составляем вопросы — обычно 15–50 секунд
        </div>
      )}
      {error && <p className="notice notice-bad">{error}</p>}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant="primary" onClick={handleGenerate} loading={busy} disabled={tooShort || reading}>
          Сгенерировать
        </Button>
      </div>
    </Modal>
  );
}

function ImportDialog({ open, onClose, onImport }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function run(mode) {
    setError("");
    try {
      const parsed = parseImportPayload(text);
      if (!parsed.questions.length) throw new Error("В JSON нет вопросов");
      onImport(parsed, mode);
      setText("");
      onClose();
    } catch (err) {
      setError(err instanceof SyntaxError ? "Это не похоже на JSON" : err.message);
    }
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    event.target.value = "";
  }

  return (
    <Modal open={open} onClose={onClose} title="Импорт JSON" wide>
      <p className="muted">
        Массив вопросов или объект <code>{"{ title, questions }"}</code>. Поля вопроса:{" "}
        <code>type</code>, <code>text</code>, <code>options</code>, <code>correct</code>.
      </p>
      <AutoTextarea
        className="input input-mono input-capped"
        minRows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='[{"type":"single","text":"2 + 2?","options":["3","4"],"correct":[1]}]'
        spellCheck={false}
        autoFocus
      />
      <label className="link-btn file-btn">
        Или выбрать файл .json
        <input type="file" accept="application/json,.json" onChange={readFile} hidden />
      </label>
      {error && <p className="notice notice-bad">{error}</p>}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="secondary" onClick={() => run("append")} disabled={!text.trim()}>
          Добавить к текущим
        </Button>
        <Button variant="primary" onClick={() => run("replace")} disabled={!text.trim()}>
          Заменить все
        </Button>
      </div>
    </Modal>
  );
}

function SaveIndicator({ state, savedAt, error }) {
  const text = {
    saved: savedAt ? `Сохранено в ${formatTime(savedAt)}` : "Всё сохранено",
    dirty: "Есть изменения…",
    saving: "Сохраняем…",
    error: `Не сохранено: ${error}`,
    blocked: "Не сохранено — исправьте ошибки",
  }[state];
  return (
    <p className={`save-state save-${state}`} role="status">
      <span className="save-dot" aria-hidden="true" />
      {text}
    </p>
  );
}

export default function QuizEditorPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { toast } = useFeedback();
  const cached = getCachedQuiz(id, 15_000);

  const [loaded, setLoaded] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState(cached?.title ?? "");
  const [description, setDescription] = useState(cached?.description ?? "");
  const [tags, setTags] = useState((cached?.tags || []).join(", "));
  const [status, setStatus] = useState(cached?.status ?? "draft");
  const [questions, setQuestions] = useState(() => toQuestions(cached?.questions));
  const [focusKey, setFocusKey] = useState(null);
  const [dialog, setDialog] = useState(() => (params.get("generate") ? "generate" : null));

  const [saveState, setSaveState] = useState("saved");
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const latestRef = useRef(null);
  latestRef.current = { title, description, tags, status, questions };
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  const timerRef = useRef(null);
  const skipNextChangeRef = useRef(true);

  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    fetchQuiz(id)
      .then((quiz) => {
        if (cancelled) return;
        skipNextChangeRef.current = true;
        setTitle(quiz.title);
        setDescription(quiz.description || "");
        setTags((quiz.tags || []).join(", "));
        setStatus(quiz.status);
        setQuestions(toQuestions(quiz.questions));
        setLoaded(true);
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (params.get("generate")) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problems = useMemo(
    () =>
      questions.flatMap((question, index) => {
        const errors = validateQuestion(question);
        return errors.length ? [{ key: question._key, index, error: errors[0] }] : [];
      }),
    [questions]
  );
  const canPublish = problems.length === 0 && questions.length > 0;

  const save = useCallback(
    async ({ nextStatus, keepalive = false } = {}) => {
      clearTimeout(timerRef.current);
      const data = latestRef.current;
      const targetStatus = nextStatus || data.status;
      const version = versionRef.current;

      if (targetStatus === "published") {
        const hasErrors = data.questions.some((q) => validateQuestion(q).length);
        if (hasErrors) {
          setSaveState("blocked");
          return false;
        }
      }
      if (savingRef.current && !keepalive) {
        timerRef.current = setTimeout(() => save({ nextStatus }), 300);
        return false;
      }

      savingRef.current = true;
      if (!keepalive) setSaveState("saving");
      try {
        const { quiz } = await apiRequest(`/api/quizzes/${id}`, {
          method: "PUT",
          keepalive,
          body: {
            title: data.title,
            description: data.description,
            tags: data.tags,
            status: targetStatus,
            questions: data.questions,
          },
        });
        savedVersionRef.current = Math.max(savedVersionRef.current, version);
        upsertQuiz(quiz, { withQuestions: true });
        setStatus(quiz.status);
        setSavedAt(Date.now());
        setSaveError("");
        setSaveState(versionRef.current === version ? "saved" : "dirty");
        return true;
      } catch (err) {
        setSaveError(err.message);
        setSaveState("error");
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [id]
  );

  // Autosave after every change
  useEffect(() => {
    if (!loaded) return undefined;
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false;
      return undefined;
    }
    versionRef.current += 1;
    setSaveState("dirty");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(), AUTOSAVE_DELAY_MS);
    return undefined;
  }, [title, description, tags, questions, loaded, save]);

  // Flush on leave / warn on close
  useEffect(() => {
    const hasUnsaved = () => versionRef.current !== savedVersionRef.current;
    function onBeforeUnload(event) {
      if (!hasUnsaved()) return;
      save({ keepalive: true });
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timerRef.current);
      if (hasUnsaved()) save({ keepalive: true });
    };
  }, [save]);

  // Cmd/Ctrl+S saves right away
  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const changeQuestion = useCallback((key, next) => {
    setQuestions((prev) => prev.map((question) => (question._key === key ? next : question)));
  }, []);

  const moveQuestion = useCallback((key, direction) => {
    setQuestions((prev) => {
      const index = prev.findIndex((question) => question._key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }, []);

  const removeQuestion = useCallback(
    (key) => {
      let removed = null;
      let removedIndex = -1;
      setQuestions((prev) => {
        removedIndex = prev.findIndex((question) => question._key === key);
        removed = prev[removedIndex];
        const next = prev.filter((question) => question._key !== key);
        return next.length ? next : [withKey(createEmptyQuestion())];
      });
      if (removed && !isBlankQuestion(removed)) {
        toast("Вопрос удалён", {
          action: {
            label: "Вернуть",
            onClick: () =>
              setQuestions((prev) => {
                const copy = prev.filter((question) => !isBlankQuestion(question) || prev.length > 1);
                copy.splice(Math.min(removedIndex, copy.length), 0, removed);
                return copy;
              }),
          },
          duration: 5000,
        });
      }
    },
    [toast]
  );

  const duplicateQuestion = useCallback((key) => {
    const { _key: copyKey } = withKey({});
    setQuestions((prev) => {
      const index = prev.findIndex((question) => question._key === key);
      if (index < 0 || prev.length >= QUIZ_LIMITS.maxQuestions) return prev;
      const copy = { ...prev[index], id: null, _key: copyKey };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
    setFocusKey(copyKey);
  }, []);

  function addQuestion() {
    if (questions.length >= QUIZ_LIMITS.maxQuestions) return;
    const question = withKey(createEmptyQuestion());
    setQuestions((prev) => [...prev, question]);
    setFocusKey(question._key);
  }

  function handleGenerated(data) {
    const generated = (data.questions || []).map(withKey);
    setQuestions((prev) =>
      [...prev.filter((question) => !isBlankQuestion(question)), ...generated].slice(
        0,
        QUIZ_LIMITS.maxQuestions
      )
    );
    if (data.title && DEFAULT_TITLES.includes(title.trim())) setTitle(data.title);
    if (generated[0]) setFocusKey(generated[0]._key);
    toast(`Добавлено: ${formatQuestions(generated.length)}. Проверьте ответы.`);
  }

  function handleImport(parsed, mode) {
    const imported = parsed.questions.map(withKey);
    if (parsed.title && DEFAULT_TITLES.includes(title.trim())) setTitle(parsed.title);
    if (parsed.description && !description) setDescription(parsed.description);
    if (parsed.tags?.length && !tags.trim()) setTags(parsed.tags.join(", "));
    setQuestions((prev) =>
      mode === "replace"
        ? imported
        : [...prev.filter((question) => !isBlankQuestion(question)), ...imported].slice(
            0,
            QUIZ_LIMITS.maxQuestions
          )
    );
    toast(`Импортировано: ${formatQuestions(imported.length)}`);
  }

  async function publish(next) {
    const ok = await save({ nextStatus: next });
    if (ok) toast(next === "published" ? "Тест опубликован — можно звать на дуэль" : "Тест снят с публикации");
  }

  function jumpTo(key) {
    setFocusKey(null);
    requestAnimationFrame(() => setFocusKey(key));
  }

  if (loadError) {
    return (
      <PageLayout width="narrow">
        <p className="notice notice-bad">{loadError}</p>
        <Button variant="secondary" to="/me/quizzes">
          ← К тестам
        </Button>
      </PageLayout>
    );
  }

  if (!loaded) return <PageSkeleton />;

  return (
    <PageLayout width="wide" className="editor">
      <div className="editor-top">
        <Link to="/me/quizzes" className="link-quiet">
          ← Мои тесты
        </Link>
        <SaveIndicator state={saveState} savedAt={savedAt} error={saveError} />
      </div>

      <div className="editor-grid">
        <div className="editor-main">
          <section className="editor-meta">
            <AutoTextarea
              className="title-input"
              minRows={1}
              value={title}
              maxLength={QUIZ_LIMITS.maxTitle}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              placeholder="Название теста"
              aria-label="Название теста"
            />
            <AutoTextarea
              className="desc-input"
              minRows={1}
              value={description}
              maxLength={QUIZ_LIMITS.maxDescription}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткое описание — для кого и о чём (необязательно)"
              aria-label="Описание"
            />
            <input
              className="tags-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Теги через запятую: алгебра, контрольная"
              aria-label="Теги"
            />
          </section>

          <div className="section-head">
            <h2 className="section-title">
              Вопросы <span className="count">{questions.length}</span>
            </h2>
            <div className="row row-tight">
              <Button variant="ghost" size="sm" onClick={() => setDialog("generate")}>
                Из файла или текста
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDialog("import")}>
                Импорт JSON
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadQuizJson({
                    title,
                    description,
                    tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                    questions,
                  })
                }
              >
                Экспорт
              </Button>
            </div>
          </div>

          <div className="qlist">
            {questions.map((question, index) => (
              <QuestionCard
                key={question._key}
                question={question}
                index={index}
                total={questions.length}
                focus={focusKey === question._key}
                onChange={changeQuestion}
                onMove={moveQuestion}
                onRemove={removeQuestion}
                onDuplicate={duplicateQuestion}
              />
            ))}
          </div>

          <button
            type="button"
            className="add-question"
            onClick={addQuestion}
            disabled={questions.length >= QUIZ_LIMITS.maxQuestions}
          >
            + Добавить вопрос
          </button>
        </div>

        <aside className="editor-side">
          <div className="side-block">
            <p className="side-label">Статус</p>
            <p className={`status status-${status} status-lg`}>
              {status === "published" ? "Опубликован" : "Черновик"}
            </p>
            {status === "published" ? (
              <>
                <p className="muted">Тест доступен для дуэлей. Правки сохраняются автоматически.</p>
                <Button variant="secondary" block onClick={() => publish("draft")}>
                  Снять с публикации
                </Button>
              </>
            ) : (
              <>
                <p className="muted">Черновик сохраняется сам. Опубликуйте, чтобы играть дуэли.</p>
                <Button
                  variant="primary"
                  block
                  onClick={() => publish("published")}
                  disabled={!canPublish || saveState === "saving"}
                >
                  Опубликовать
                </Button>
              </>
            )}
          </div>

          {problems.length > 0 && (
            <div className="side-block">
              <p className="side-label">
                Нужно поправить <span className="count">{problems.length}</span>
              </p>
              <ul className="problems">
                {problems.slice(0, 6).map((problem) => (
                  <li key={problem.key}>
                    <button type="button" onClick={() => jumpTo(problem.key)}>
                      <span className="problem-num">{String(problem.index + 1).padStart(2, "0")}</span>
                      {problem.error}
                    </button>
                  </li>
                ))}
              </ul>
              {problems.length > 6 && <p className="muted">и ещё {problems.length - 6}</p>}
            </div>
          )}

          <div className="side-block side-links">
            <Button variant="secondary" size="sm" to={`/q/${id}/study`} disabled={!canPublish}>
              Пройти соло
            </Button>
            <Button variant="ghost" size="sm" to={`/me/quizzes/${id}/review`}>
              Ответы
            </Button>
            {status === "published" && (
              <Button variant="accent" size="sm" to={`/multi/create?quiz=${id}`}>
                Дуэль
              </Button>
            )}
          </div>
          <p className="side-kbd">
            <kbd>{MOD_KEY}</kbd>
            <kbd>S</kbd> — сохранить сейчас
          </p>
        </aside>
      </div>

      <GenerateDialog
        open={dialog === "generate"}
        onClose={() => setDialog(null)}
        quizId={id}
        onGenerated={handleGenerated}
      />
      <ImportDialog
        open={dialog === "import"}
        onClose={() => setDialog(null)}
        onImport={handleImport}
      />
    </PageLayout>
  );
}
