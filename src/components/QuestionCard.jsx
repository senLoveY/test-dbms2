import { memo, useEffect, useRef } from "react";
import { QUIZ_LIMITS, validateQuestion } from "../../lib/quizModel.js";
import AutoTextarea from "./AutoTextarea.jsx";
import Segmented from "./Segmented.jsx";

const LETTERS = "ABCDEFGH";

const TYPE_OPTIONS = [
  { value: "single", label: "Один ответ" },
  { value: "multiple", label: "Несколько" },
];

function IconButton({ label, onClick, disabled, children, tone }) {
  return (
    <button
      type="button"
      className={`icon-btn ${tone === "danger" ? "icon-btn-danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function isBlank(question) {
  return !question.text.trim() && question.options.every((option) => !option.trim());
}

function QuestionCard({ question, index, total, focus, onChange, onMove, onRemove, onDuplicate }) {
  const textRef = useRef(null);
  const optionRefs = useRef([]);
  const focusOptionRef = useRef(null);
  const key = question._key;
  const errors = isBlank(question) ? [] : validateQuestion(question);

  useEffect(() => {
    if (!focus) return;
    textRef.current?.focus({ preventScroll: true });
    textRef.current?.closest(".qcard")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  useEffect(() => {
    if (focusOptionRef.current == null) return;
    optionRefs.current[focusOptionRef.current]?.focus();
    focusOptionRef.current = null;
  });

  function update(patch) {
    onChange(key, { ...question, ...patch });
  }

  function setType(type) {
    update({ type, correct: type === "single" ? question.correct.slice(0, 1) : question.correct });
  }

  function updateOption(optionIndex, text) {
    update({ options: question.options.map((option, i) => (i === optionIndex ? text : option)) });
  }

  function toggleCorrect(optionIndex) {
    if (question.type === "single") {
      update({ correct: [optionIndex] });
      return;
    }
    const has = question.correct.includes(optionIndex);
    update({
      correct: has
        ? question.correct.filter((item) => item !== optionIndex)
        : [...question.correct, optionIndex].sort((a, b) => a - b),
    });
  }

  function addOption(afterIndex = question.options.length - 1) {
    if (question.options.length >= QUIZ_LIMITS.maxOptions) return;
    const at = afterIndex + 1;
    const options = [...question.options.slice(0, at), "", ...question.options.slice(at)];
    const correct = question.correct.map((item) => (item >= at ? item + 1 : item));
    focusOptionRef.current = at;
    update({ options, correct });
  }

  function removeOption(optionIndex) {
    if (question.options.length <= QUIZ_LIMITS.minOptions) return;
    const options = question.options.filter((_, i) => i !== optionIndex);
    const correct = question.correct
      .filter((item) => item !== optionIndex)
      .map((item) => (item > optionIndex ? item - 1 : item));
    focusOptionRef.current = Math.max(0, optionIndex - 1);
    update({ options, correct });
  }

  function onOptionKeyDown(event, optionIndex) {
    if (event.key === "Enter") {
      event.preventDefault();
      addOption(optionIndex);
    }
    if (event.key === "Backspace" && !question.options[optionIndex]) {
      event.preventDefault();
      removeOption(optionIndex);
    }
  }

  return (
    <article className={`qcard ${errors.length ? "has-errors" : ""}`} id={`q-${key}`}>
      <header className="qcard-head">
        <span className="qcard-num">{String(index + 1).padStart(2, "0")}</span>
        <Segmented
          size="sm"
          label="Тип вопроса"
          value={question.type}
          options={TYPE_OPTIONS}
          onChange={setType}
        />
        <div className="qcard-tools">
          <IconButton label="Выше" onClick={() => onMove(key, -1)} disabled={index === 0}>
            <path d="M8 13V3M4 7l4-4 4 4" />
          </IconButton>
          <IconButton label="Ниже" onClick={() => onMove(key, 1)} disabled={index === total - 1}>
            <path d="M8 3v10M4 9l4 4 4-4" />
          </IconButton>
          <IconButton label="Дублировать" onClick={() => onDuplicate(key)}>
            <rect x="5" y="5" width="8" height="8" rx="1.5" />
            <path d="M3 10V4a1 1 0 0 1 1-1h6" />
          </IconButton>
          <IconButton label="Удалить вопрос" tone="danger" onClick={() => onRemove(key)}>
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
          </IconButton>
        </div>
      </header>

      <AutoTextarea
        ref={textRef}
        className="input qcard-text"
        minRows={1}
        placeholder="Текст вопроса"
        value={question.text}
        maxLength={QUIZ_LIMITS.maxQuestionText}
        onChange={(e) => update({ text: e.target.value })}
        aria-label={`Текст вопроса ${index + 1}`}
      />

      <ul className="qopts">
        {question.options.map((option, optionIndex) => {
          const correct = question.correct.includes(optionIndex);
          return (
            <li className={`qopt ${correct ? "is-correct" : ""}`} key={optionIndex}>
              <button
                type="button"
                className={`qopt-mark qopt-mark-${question.type}`}
                aria-pressed={correct}
                aria-label={`${LETTERS[optionIndex]}: ${correct ? "правильный" : "отметить правильным"}`}
                title={correct ? "Правильный ответ" : "Отметить правильным"}
                onClick={() => toggleCorrect(optionIndex)}
              >
                {correct ? (
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                ) : (
                  LETTERS[optionIndex]
                )}
              </button>
              <input
                ref={(node) => {
                  optionRefs.current[optionIndex] = node;
                }}
                className="input qopt-input"
                value={option}
                maxLength={QUIZ_LIMITS.maxOptionText}
                onChange={(e) => updateOption(optionIndex, e.target.value)}
                onKeyDown={(e) => onOptionKeyDown(e, optionIndex)}
                placeholder={`Вариант ${LETTERS[optionIndex]}`}
              />
              <IconButton
                label="Удалить вариант"
                onClick={() => removeOption(optionIndex)}
                disabled={question.options.length <= QUIZ_LIMITS.minOptions}
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </IconButton>
            </li>
          );
        })}
      </ul>

      <footer className="qcard-foot">
        {question.options.length < QUIZ_LIMITS.maxOptions ? (
          <button type="button" className="link-btn" onClick={() => addOption()}>
            + вариант
          </button>
        ) : (
          <span />
        )}
        {errors.length > 0 ? (
          <span className="qcard-error">{errors[0]}</span>
        ) : (
          <span className="qcard-hint">Enter — новый вариант · нажмите букву, чтобы отметить ответ</span>
        )}
      </footer>
    </article>
  );
}

export default memo(QuestionCard);
