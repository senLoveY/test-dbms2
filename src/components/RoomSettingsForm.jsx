import {
  DEFAULT_ROOM_SETTINGS,
  ROOM_PRESETS,
  SETTINGS_OPTIONS,
  questionCountChoices,
} from "../../lib/roomSettings.js";
import Segmented from "./Segmented.jsx";
import Switch from "./Switch.jsx";

const PRESET_KEYS = Object.keys(DEFAULT_ROOM_SETTINGS);

function matchPreset(settings) {
  return (
    Object.entries(ROOM_PRESETS).find(([, preset]) =>
      PRESET_KEYS.every((key) => key === "questionCount" || preset[key] === settings[key])
    )?.[0] || "custom"
  );
}

function SettingRow({ label, children }) {
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      {children}
    </div>
  );
}

export default function RoomSettingsForm({ settings, onChange, disabled = false, maxQuestions }) {
  function set(key, value) {
    onChange({ ...settings, [key]: value });
  }

  function applyPreset(id) {
    const { label, ...preset } = ROOM_PRESETS[id];
    onChange({
      ...DEFAULT_ROOM_SETTINGS,
      ...preset,
      questionCount: Math.min(preset.questionCount, maxQuestions || preset.questionCount),
    });
  }

  const presetOptions = [
    ...Object.entries(ROOM_PRESETS).map(([id, preset]) => ({ value: id, label: preset.label })),
  ];
  const currentPreset = matchPreset(settings);
  const questionChoices = questionCountChoices(maxQuestions);
  const questionValue = Math.min(settings.questionCount, maxQuestions || settings.questionCount);

  return (
    <div className={`settings ${disabled ? "is-disabled" : ""}`}>
      <SettingRow label="Режим">
        <Segmented
          label="Режим"
          value={currentPreset}
          options={presetOptions}
          onChange={applyPreset}
          disabled={disabled}
        />
      </SettingRow>
      <SettingRow label="Время на вопрос">
        <Segmented
          label="Время на вопрос"
          size="sm"
          value={settings.timeLimitSec}
          options={SETTINGS_OPTIONS.timeLimitSec.map((s) => ({ value: s, label: `${s}с` }))}
          onChange={(v) => set("timeLimitSec", Number(v))}
          disabled={disabled}
        />
      </SettingRow>
      <SettingRow label="Вопросов">
        <Segmented
          label="Число вопросов"
          size="sm"
          value={questionChoices.includes(questionValue) ? questionValue : questionChoices.at(-1)}
          options={questionChoices.map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => set("questionCount", Number(v))}
          disabled={disabled}
        />
      </SettingRow>

      <details className="settings-more">
        <summary>Тонкая настройка</summary>
        <SettingRow label="Пауза на разбор">
          <Segmented
            label="Пауза на разбор"
            size="sm"
            value={settings.revealPauseMs}
            options={SETTINGS_OPTIONS.revealPauseMs.map((ms) => ({ value: ms, label: `${ms / 1000}с` }))}
            onChange={(v) => set("revealPauseMs", Number(v))}
            disabled={disabled}
          />
        </SettingRow>
        <SettingRow label="Очков за вопрос">
          <Segmented
            label="Максимум очков за вопрос"
            size="sm"
            value={settings.maxPointsPerQuestion}
            options={SETTINGS_OPTIONS.maxPointsPerQuestion.map((p) => ({ value: p, label: String(p) }))}
            onChange={(v) => set("maxPointsPerQuestion", Number(v))}
            disabled={disabled}
          />
        </SettingRow>
        <SettingRow label="Минимум за медленный ответ">
          <Segmented
            label="Минимальная доля очков за скорость"
            size="sm"
            value={settings.minTimeFactor}
            options={SETTINGS_OPTIONS.minTimeFactor.map((f) => ({ value: f, label: `${Math.round(f * 100)}%` }))}
            onChange={(v) => set("minTimeFactor", Number(v))}
            disabled={disabled}
          />
        </SettingRow>
        <Switch
          label="Перемешивать варианты"
          checked={settings.shuffleOptions}
          onChange={(v) => set("shuffleOptions", v)}
          disabled={disabled}
        />
        <Switch
          label="Автоотправка по таймеру"
          hint="Выбранные варианты отправятся сами"
          checked={settings.autoSubmitOnTimeout}
          onChange={(v) => set("autoSubmitOnTimeout", v)}
          disabled={disabled}
        />
        <Switch
          label="Частичные баллы"
          hint="Для вопросов с несколькими ответами"
          checked={settings.partialCredit}
          onChange={(v) => set("partialCredit", v)}
          disabled={disabled}
        />
      </details>
    </div>
  );
}

export { DEFAULT_ROOM_SETTINGS };
