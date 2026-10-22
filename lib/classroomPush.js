import { getPublicQuestion, getQuestionShuffleKey } from "./gameLogic.js";
import { parseRoomRecord } from "./roomSettings.js";

/**
 * A classroom phone's next state from a Realtime room row alone, without calling the API.
 * The row carries public_question (the open question, no answers) and, after a reveal,
 * public_reveal (right options and standings) — see realtime-push-migration.sql.
 *
 * Returns null whenever the row isn't enough (lobby, a row from before the migration, a
 * stale event, a player not in the standings); the caller then fetches the state as before.
 */
export function applyClassroomPush(prev, row) {
  if (!prev || !row || prev.viewer?.mode !== "classroom" || prev.viewer.isHost) return null;
  const me = prev.players?.[0];
  if (!me || row.id !== prev.room.id) return null;

  const { public_question: pushedQuestion, public_reveal: pushedReveal, questions_snapshot: _ignored, ...fields } = row;
  const room = { ...prev.room, ...fields };
  const settings = parseRoomRecord(room);
  const sameQuestion = room.current_index === prev.room.current_index;

  if (room.status === "playing") {
    if (!pushedQuestion || pushedQuestion.index !== room.current_index || !pushedQuestion.question) return null;
    const question = pushedQuestion.question;
    const currentQuestion = getPublicQuestion(
      question,
      settings.shuffleOptions ? getQuestionShuffleKey(room.id, room.current_index, question.id) : null
    );
    const fresh = !sameQuestion || prev.room.status !== "playing";
    return {
      ...prev,
      room,
      settings,
      currentQuestion,
      reveal: null,
      showPlayerAnswers: false,
      serverTime: undefined,
      players: [
        fresh
          ? { ...me, has_answered: false, skipped: false, roundPoints: null, last_answer_correct: null, answerBreakdown: null }
          : me,
      ],
    };
  }

  if (room.status === "revealing" || room.status === "finished") {
    if (!pushedReveal || !Array.isArray(pushedReveal.standings)) return null;
    // a reveal for another question than the one on screen: let a fetch sort it out
    if (room.status === "revealing" && (pushedReveal.index !== room.current_index || !sameQuestion)) return null;
    const mine = pushedReveal.standings.find((player) => player.id === me.user_id);
    if (!mine) return null;

    const standings = [...pushedReveal.standings].sort(
      (a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), "ru")
    );
    const finished = room.status === "finished";
    return {
      ...prev,
      room,
      settings,
      currentQuestion: finished ? null : prev.currentQuestion,
      reveal: finished ? null : { correctOptions: pushedReveal.correctOptions || [], questionId: prev.reveal?.questionId },
      showPlayerAnswers: !finished,
      serverTime: undefined,
      players: [
        {
          ...me,
          score: mine.score,
          has_answered: true,
          skipped: Boolean(mine.skipped),
          roundPoints: mine.round,
          last_answer_correct: Boolean(mine.ok),
        },
      ],
      classroom: {
        ...prev.classroom,
        playerCount: standings.length,
        rank: standings.filter((player) => player.score > mine.score).length + 1,
        podium: finished ? standings.slice(0, 3).map(({ name, score }) => ({ username: name, score })) : null,
      },
    };
  }

  return null;
}
