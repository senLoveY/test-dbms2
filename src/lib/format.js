const pluralRules = new Intl.PluralRules("ru-RU");

export function plural(count, forms) {
  const [one, few, many] = forms;
  const rule = pluralRules.select(count);
  const word = rule === "one" ? one : rule === "few" ? few : many;
  return `${count} ${word}`;
}

export function formatQuestions(count) {
  return plural(count || 0, ["вопрос", "вопроса", "вопросов"]);
}

export function formatPoints(count) {
  return plural(count || 0, ["очко", "очка", "очков"]);
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function formatDate(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `сегодня, ${timeFormat.format(date)}`;
  return dateFormat.format(date);
}

export function formatTime(value) {
  return timeFormat.format(new Date(value));
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}

const AUTH_ERRORS = {
  "Invalid login credentials": "Неверный email или пароль",
  "Email not confirmed": "Подтвердите email — письмо уже в почте",
  "User already registered": "Такой email уже зарегистрирован",
  "Password should be at least 6 characters": "Пароль — минимум 6 символов",
};

export function humanizeAuthError(message) {
  return AUTH_ERRORS[message] || message;
}
