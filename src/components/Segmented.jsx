/** Segmented control: options = [{ value, label }] */
export default function Segmented({ value, options, onChange, label, size = "md", disabled = false }) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = String(option.value) === String(value);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`segmented-item ${active ? "is-active" : ""}`}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
