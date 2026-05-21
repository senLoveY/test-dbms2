function answerBadge(player) {
  const roundPts = player.roundPoints ?? player.last_points ?? 0;
  if (player.last_answer_correct) return { className: "badge right", text: "Верно" };
  if (roundPts > 0) return { className: "badge partial", text: "Частично" };
  return { className: "badge wrong", text: "Неверно" };
}

export default function PlayerAnswers({ players, title = "Ответы игроков" }) {
  if (!players?.length) return null;

  return (
    <div className="player-answers">
      <p className="muted">{title}</p>
      <ul className="player-list">
        {players.map((player) => {
          const badge = answerBadge(player);
          const breakdown = player.answerBreakdown || [];

          return (
            <li className="player-card" key={player.user_id}>
              <div>
                <strong>{player.username}</strong>
                {breakdown.length ? (
                  <ul className="review-options nested-answers">
                    {breakdown.map((item) => (
                      <li
                        key={`${player.user_id}-${item.label}`}
                        className={`state-${item.state}`}
                      >
                        {item.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Не ответил</p>
                )}
              </div>
              {player.has_answered && (
                <span className={badge.className}>
                  {(player.roundPoints ?? player.last_points ?? 0) > 0
                    ? `+${player.roundPoints ?? player.last_points}`
                    : "0"}{" "}
                  · {badge.text}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
