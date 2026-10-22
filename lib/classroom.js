import { buildOptionOrder, getQuestionShuffleKey, getSelectedAnswerBreakdown } from "./gameLogic.js";

/** Classroom mode: the host's screen shows the question, players answer from phones. */

export const ROOM_MODES = ["duel", "classroom"];
export const CLASSROOM_MAX_PLAYERS = 60;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

export function normalizeRoomMode(value) {
  return ROOM_MODES.includes(value) ? value : "duel";
}

const LINK_LIKE = /(https?:|www\.|\.(ru|by|com|net|org|io|me|su)\b|@)/i;

export function normalizeNickname(value) {
  const nickname = String(value ?? "").replace(/\s+/g, " ").trim();
  if (nickname.length < NICKNAME_MIN) return { error: "Имя — хотя бы 2 символа" };
  if (nickname.length > NICKNAME_MAX) return { error: `Имя — до ${NICKNAME_MAX} символов` };
  if (LINK_LIKE.test(nickname)) return { error: "Имя не должно быть ссылкой или адресом" };
  return { nickname };
}

function displayOrder(room, question, settings) {
  if (!settings.shuffleOptions) return question.options.map((_, index) => index);
  return buildOptionOrder(
    question.options.length,
    getQuestionShuffleKey(room.id, room.current_index, question.id)
  );
}

/** How many players picked each option, in the order the screen shows them. */
export function answerDistribution(room, question, settings, players) {
  return displayOrder(room, question, settings).map(
    (original) =>
      players.filter((player) => Array.isArray(player.last_answer) && player.last_answer.includes(original))
        .length
  );
}

function byScore(a, b) {
  return b.score - a.score || a.username.localeCompare(b.username, "ru");
}

/**
 * Classroom view of the raw room state. The host gets the whole class and
 * the answer counts; a player gets only their own row and their place,
 * so the response stays small however many people are in the room.
 */
export function buildClassroomView({ room, settings, question, players: rawPlayers }, userId, common) {
  const isHost = room.host_id === userId;
  const revealing = room.status === "revealing";
  const showRound = revealing || room.status === "finished";
  const answered = rawPlayers.filter((player) => player.has_answered).length;

  if (isHost) {
    const players = rawPlayers
      .map((player) => ({
        user_id: player.user_id,
        username: player.username,
        score: player.score,
        correct_count: player.correct_count ?? 0,
        has_answered: player.has_answered,
        roundPoints: showRound ? player.last_points : null,
      }))
      .sort(byScore);

    return {
      ...common,
      viewer: { isHost: true, mode: "classroom" },
      players,
      classroom: {
        playerCount: players.length,
        answered,
        distribution:
          revealing && question ? answerDistribution(room, question, settings, rawPlayers) : null,
      },
    };
  }

  const mine = rawPlayers.find((player) => player.user_id === userId);
  const me = mine && {
    user_id: mine.user_id,
    username: mine.username,
    score: mine.score,
    has_answered: mine.has_answered,
    // joined mid-question or ran out of time: "answered" with nothing picked
    skipped: mine.has_answered && !(Array.isArray(mine.last_answer) && mine.last_answer.length),
    last_answer_correct: showRound ? mine.last_answer_correct : null,
    roundPoints: showRound ? mine.last_points : null,
    answerBreakdown: revealing && question ? getSelectedAnswerBreakdown(question, mine.last_answer) : null,
  };
  const ranked = [...rawPlayers].sort(byScore);

  return {
    ...common,
    viewer: { isHost: false, mode: "classroom" },
    players: me ? [me] : [],
    classroom: {
      playerCount: rawPlayers.length,
      rank: me ? rawPlayers.filter((player) => player.score > me.score).length + 1 : null,
      podium:
        room.status === "finished"
          ? ranked.slice(0, 3).map(({ username, score }) => ({ username, score }))
          : null,
    },
  };
}
