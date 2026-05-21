import { useMemo } from "react";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import PlayerAnswers from "./PlayerAnswers.jsx";

function AnimatedScore({ from, to, active }) {
  const value = useAnimatedNumber(from, to, active, 1000);
  const showFrom = active && from !== to;

  return (
    <span className="animated-score">
      {showFrom && <span className="score-from">{from}</span>}
      {showFrom && <span className="score-arrow">→</span>}
      <span className="score-to">{value}</span>
    </span>
  );
}

export default function RoundReveal({ players, reveal, showPlayerAnswers }) {
  const roundWinnerId = useMemo(() => {
    if (!players?.length) return null;
    const best = [...players].sort((a, b) => (b.roundPoints ?? 0) - (a.roundPoints ?? 0))[0];
    return (best.roundPoints ?? 0) > 0 ? best.user_id : null;
  }, [players]);

  const isReveal = Boolean(reveal);

  return (
    <div className={`round-reveal ${isReveal ? "round-reveal-enter" : ""}`}>
      {roundWinnerId && (
        <p className="round-winner-banner">
          🏅 Лучший ответ раунда:{" "}
          <strong>{players.find((p) => p.user_id === roundWinnerId)?.username}</strong>
          {" "}(+
          {players.find((p) => p.user_id === roundWinnerId)?.roundPoints ?? 0})
        </p>
      )}

      <div className="round-scoreboard">
        {players.map((player) => {
          const previousScore = Math.max(0, player.score - (player.roundPoints ?? 0));
          const isWinner = player.user_id === roundWinnerId;

          return (
            <div
              key={player.user_id}
              className={`round-score-card ${isWinner ? "round-score-card-winner" : ""}`}
            >
              <span className="round-score-name">{player.username}</span>
              <div className="round-score-values">
                <AnimatedScore
                  from={previousScore}
                  to={player.score}
                  active={isReveal}
                />
                {player.roundPoints != null && (
                  <span
                    className={`round-points-delta ${
                      player.roundPoints > 0 ? "positive" : "zero"
                    }`}
                  >
                    {player.roundPoints > 0 ? `+${player.roundPoints}` : "+0"} за раунд
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {reveal && (
        <div className="reveal-box reveal-box-nested">
          <p className="live-result right">Правильный ответ</p>
          <ul className="review-options">
            {reveal.correctOptions.map((text) => (
              <li key={text} className="state-right-selected">
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showPlayerAnswers && (
        <PlayerAnswers players={players} title="Ответы игроков" />
      )}
    </div>
  );
}
