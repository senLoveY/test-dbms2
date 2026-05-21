export default function RoomSettingsSummary({ settings }) {
  if (!settings) return null;

  return (
    <ul className="settings-summary">
      <li>⏱ {settings.timeLimitSec} сек на вопрос</li>
      <li>📝 {settings.questionCount} вопросов</li>
      <li>⏸ {settings.revealPauseMs / 1000} сек на разбор</li>
      <li>🏆 до {settings.maxPointsPerQuestion} очков за вопрос</li>
      <li>⚡ мин. {Math.round(settings.minTimeFactor * 100)}% за скорость</li>
      <li>{settings.shuffleOptions ? "🔀 Варианты перемешиваются" : "📋 Варианты по порядку"}</li>
      <li>
        {settings.autoSubmitOnTimeout
          ? "✓ Автоотправка по таймеру"
          : "✗ Без автоотправки"}
      </li>
      <li>
        {settings.partialCredit
          ? "✓ Частичные баллы"
          : "✗ Только полный ответ"}
      </li>
    </ul>
  );
}
