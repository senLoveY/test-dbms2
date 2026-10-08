const STATE_LABEL = {
  "right-selected": "верно",
  "right-missed": "правильный ответ",
  "wrong-selected": "неверно",
};

/**
 * Answer options for solo and duel.
 * states: optional per-option result ("right-selected" | "right-missed" | "wrong-selected" | "neutral")
 * marks: optional per-option list of player names who picked it
 */
export default function OptionList({
  options,
  type,
  selected,
  onToggle,
  locked = false,
  states = null,
  marks = null,
}) {
  const role = type === "multiple" ? "checkbox" : "radio";

  return (
    <div
      className={`options ${locked ? "is-locked" : ""} ${states ? "is-graded" : ""}`}
      role={type === "multiple" ? "group" : "radiogroup"}
      aria-label="Варианты ответа"
    >
      {options.map((option, index) => {
        const isSelected = selected.includes(index);
        const state = states?.[index] || "neutral";
        return (
          <button
            key={`${index}-${option}`}
            type="button"
            role={role}
            aria-checked={isSelected}
            aria-disabled={locked}
            className={`option ${isSelected ? "is-selected" : ""} state-${state}`}
            style={{ "--i": index }}
            onClick={() => !locked && onToggle(index)}
          >
            <span className={`option-key option-key-${type}`} aria-hidden="true">
              {index + 1}
            </span>
            <span className="option-text">{option}</span>
            {marks?.[index]?.length > 0 && (
              <span className="option-marks">
                {marks[index].map((name) => (
                  <span className="option-mark" key={name}>
                    {name}
                  </span>
                ))}
              </span>
            )}
            {STATE_LABEL[state] && <span className="option-state">{STATE_LABEL[state]}</span>}
          </button>
        );
      })}
    </div>
  );
}
