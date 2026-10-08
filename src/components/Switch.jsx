export default function Switch({ checked, onChange, label, hint, disabled = false }) {
  return (
    <label className={`switch-row ${disabled ? "is-disabled" : ""}`}>
      <span className="switch-text">
        <span>{label}</span>
        {hint && <small className="field-hint">{hint}</small>}
      </span>
      <input
        type="checkbox"
        className="switch"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
