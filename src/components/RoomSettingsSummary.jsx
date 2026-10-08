export default function RoomSettingsSummary({ settings }) {
  if (!settings) return null;

  const items = [
    ["Время на вопрос", `${settings.timeLimitSec} с`],
    ["Вопросов", settings.questionCount],
    ["Разбор", `${settings.revealPauseMs / 1000} с`],
    ["Очков за вопрос", `до ${settings.maxPointsPerQuestion}`],
    ["Минимум за скорость", `${Math.round(settings.minTimeFactor * 100)}%`],
    ["Варианты", settings.shuffleOptions ? "перемешаны" : "по порядку"],
    ["Автоотправка", settings.autoSubmitOnTimeout ? "да" : "нет"],
    ["Частичные баллы", settings.partialCredit ? "да" : "нет"],
  ];

  return (
    <dl className="kv">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
