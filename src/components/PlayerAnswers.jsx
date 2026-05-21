export default function PlayerAnswers({ players, title = "Ответы игроков" }) {
  if (!players?.length) return null;

  return (
    <div className="player-answers">
      <p className="muted">{title}</p>
      <ul className="player-list">
        {players.map((player) => (
          <li className="player-card" key={player.user_id}>
            <div>
              <strong>{player.username}</strong>
              {player.answerLabels?.length ? (
                <ul className="review-options nested-answers">
                  {player.answerLabels.map((label) => (
                    <li
                      key={`${player.user_id}-${label}`}
                      className={
                        player.last_answer_correct
                          ? "state-right-selected"
                          : "state-wrong-selected"
                      }
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Не ответил</p>
              )}
            </div>
            {player.has_answered && (
              <span
                className={
                  player.last_answer_correct ? "badge right" : "badge wrong"
                }
              >
                {player.last_points > 0 ? `+${player.last_points}` : "0"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
