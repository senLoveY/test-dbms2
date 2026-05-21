import {
  DEFAULT_ROOM_SETTINGS,
  ROOM_PRESETS,
  SETTINGS_OPTIONS,
} from "../../lib/roomSettings.js";

function SelectSetting({ label, value, options, onChange, formatOption }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => {
          const val = typeof option === "object" ? option.value : option;
          const text =
            typeof option === "object"
              ? option.label
              : formatOption
                ? formatOption(option)
                : String(option);
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function ToggleSetting({ label, checked, onChange, hint }) {
  return (
    <label className="setting-row setting-toggle">
      <span>
        {label}
        {hint && <small className="setting-hint">{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function RoomSettingsForm({
  settings,
  onChange,
  onPreset,
  disabled = false,
  showPresets = true,
}) {
  function set(key, rawValue) {
    const numericKeys = [
      "timeLimitSec",
      "questionCount",
      "revealPauseMs",
      "minTimeFactor",
      "maxPointsPerQuestion",
    ];
    const value = numericKeys.includes(key) ? Number(rawValue) : rawValue;
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className={`room-settings ${disabled ? "room-settings-disabled" : ""}`}>
      {showPresets && (
        <div className="preset-row">
          {Object.entries(ROOM_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              className="preset-chip"
              disabled={disabled}
              onClick={() => onPreset?.(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="settings-grid">
        <SelectSetting
          label="Время на вопрос"
          value={settings.timeLimitSec}
          options={SETTINGS_OPTIONS.timeLimitSec.map((s) => ({
            value: s,
            label: `${s} сек`,
          }))}
          onChange={(v) => set("timeLimitSec", v)}
        />
        <SelectSetting
          label="Число вопросов"
          value={settings.questionCount}
          options={SETTINGS_OPTIONS.questionCount.map((n) => ({
            value: n,
            label: `${n}`,
          }))}
          onChange={(v) => set("questionCount", v)}
        />
        <SelectSetting
          label="Пауза на разбор"
          value={settings.revealPauseMs}
          options={SETTINGS_OPTIONS.revealPauseMs.map((ms) => ({
            value: ms,
            label: `${ms / 1000} сек`,
          }))}
          onChange={(v) => set("revealPauseMs", v)}
        />
        <SelectSetting
          label="Макс. очков за вопрос"
          value={settings.maxPointsPerQuestion}
          options={SETTINGS_OPTIONS.maxPointsPerQuestion.map((p) => ({
            value: p,
            label: `${p}`,
          }))}
          onChange={(v) => set("maxPointsPerQuestion", v)}
        />
        <SelectSetting
          label="Мин. доля за скорость"
          value={settings.minTimeFactor}
          options={SETTINGS_OPTIONS.minTimeFactor.map((f) => ({
            value: f,
            label: `${Math.round(f * 100)}%`,
          }))}
          onChange={(v) => set("minTimeFactor", v)}
        />
        <ToggleSetting
          label="Перемешивать варианты"
          checked={settings.shuffleOptions}
          onChange={(v) => set("shuffleOptions", v)}
        />
        <ToggleSetting
          label="Автоотправка по таймеру"
          hint="Выбранные варианты отправятся сами"
          checked={settings.autoSubmitOnTimeout}
          onChange={(v) => set("autoSubmitOnTimeout", v)}
        />
        <ToggleSetting
          label="Частичные баллы"
          hint="Для вопросов с несколькими ответами"
          checked={settings.partialCredit}
          onChange={(v) => set("partialCredit", v)}
        />
      </div>
    </div>
  );
}

export { DEFAULT_ROOM_SETTINGS };
