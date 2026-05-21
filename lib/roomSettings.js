export const DEFAULT_ROOM_SETTINGS = {
  timeLimitSec: 30,
  questionCount: 20,
  revealPauseMs: 3500,
  shuffleOptions: true,
  autoSubmitOnTimeout: true,
  partialCredit: true,
  minTimeFactor: 0.6,
  maxPointsPerQuestion: 1000,
};

export const ROOM_PRESETS = {
  quick: {
    label: "Быстрая",
    timeLimitSec: 20,
    questionCount: 5,
    revealPauseMs: 2500,
    shuffleOptions: true,
    autoSubmitOnTimeout: true,
    partialCredit: true,
    minTimeFactor: 0.6,
    maxPointsPerQuestion: 1000,
  },
  standard: {
    label: "Стандарт",
    ...DEFAULT_ROOM_SETTINGS,
  },
  exam: {
    label: "Экзамен",
    timeLimitSec: 45,
    questionCount: 20,
    revealPauseMs: 5000,
    shuffleOptions: true,
    autoSubmitOnTimeout: true,
    partialCredit: false,
    minTimeFactor: 0.4,
    maxPointsPerQuestion: 1500,
  },
  training: {
    label: "Тренировка",
    timeLimitSec: 60,
    questionCount: 10,
    revealPauseMs: 5000,
    shuffleOptions: true,
    autoSubmitOnTimeout: true,
    partialCredit: true,
    minTimeFactor: 0.8,
    maxPointsPerQuestion: 500,
  },
};

const TIME_LIMITS = [15, 20, 30, 45, 60];
const QUESTION_COUNTS = [5, 10, 15, 20];
const REVEAL_PAUSES = [2000, 3500, 5000];
const MIN_TIME_FACTORS = [0.4, 0.6, 0.8];
const MAX_POINTS = [500, 1000, 1500];

function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function pickBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

/** Нормализация настроек из API / формы */
export function normalizeRoomSettings(input = {}) {
  const base = { ...DEFAULT_ROOM_SETTINGS, ...input };

  return {
    timeLimitSec: pickEnum(Number(base.timeLimitSec), TIME_LIMITS, 30),
    questionCount: pickEnum(Number(base.questionCount), QUESTION_COUNTS, 20),
    revealPauseMs: pickEnum(Number(base.revealPauseMs), REVEAL_PAUSES, 3500),
    shuffleOptions: pickBool(base.shuffleOptions, true),
    autoSubmitOnTimeout: pickBool(base.autoSubmitOnTimeout, true),
    partialCredit: pickBool(base.partialCredit, true),
    minTimeFactor: pickEnum(Number(base.minTimeFactor), MIN_TIME_FACTORS, 0.6),
    maxPointsPerQuestion: pickEnum(
      Number(base.maxPointsPerQuestion),
      MAX_POINTS,
      1000
    ),
  };
}

/** Слияние строки rooms (БД) + jsonb settings */
export function parseRoomRecord(room) {
  if (!room) return normalizeRoomSettings();

  const fromJson =
    typeof room.settings === "object" && room.settings !== null
      ? room.settings
      : {};

  return normalizeRoomSettings({
    timeLimitSec: room.time_limit_sec,
    questionCount: room.question_count,
    revealPauseMs: room.reveal_pause_ms,
    ...fromJson,
  });
}

export function settingsToDbColumns(settings) {
  const s = normalizeRoomSettings(settings);
  return {
    time_limit_sec: s.timeLimitSec,
    question_count: s.questionCount,
    reveal_pause_ms: s.revealPauseMs,
    settings: {
      shuffleOptions: s.shuffleOptions,
      autoSubmitOnTimeout: s.autoSubmitOnTimeout,
      partialCredit: s.partialCredit,
      minTimeFactor: s.minTimeFactor,
      maxPointsPerQuestion: s.maxPointsPerQuestion,
    },
  };
}

export const SETTINGS_OPTIONS = {
  timeLimitSec: TIME_LIMITS,
  questionCount: QUESTION_COUNTS,
  revealPauseMs: REVEAL_PAUSES,
  minTimeFactor: MIN_TIME_FACTORS,
  maxPointsPerQuestion: MAX_POINTS,
};
