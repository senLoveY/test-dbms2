import { useMemo } from "react";
import Button from "./Button.jsx";
import PageLayout from "./PageLayout.jsx";

const CONFETTI_COLORS = ["#22d3ee", "#fbbf24", "#34d399", "#f43f5e", "#a78bfa", "#67e8f9"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        id: index,
        left: `${(index * 17) % 100}%`,
        delay: `${(index % 12) * 0.12}s`,
        duration: `${2.2 + (index % 5) * 0.35}s`,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        size: 5 + (index % 4) * 2,
        rotate: (index % 7) * 51,
      })),
    []
  );

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size * 1.4,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function VictoryScreen({
  title,
  subtitle,
  players,
  currentUserId,
  soloFinish = false,
  onHome,
}) {
  const winner = players[0];
  const youWon = winner?.user_id === currentUserId && !soloFinish;
  const isDraw =
    players.length >= 2 && players[0]?.score === players[1]?.score;

  return (
    <PageLayout className="summary victory-screen">
      <Confetti />
      <div className="victory-content">
        <div className="victory-trophy" aria-hidden="true">
          {youWon ? "🏆" : isDraw ? "🤝" : "🎮"}
        </div>
        <p className="chip victory-chip">{youWon ? "Победа" : "Финиш"}</p>
        <h1 className="victory-title">{title}</h1>
        {subtitle && <p className="subtitle victory-subtitle">{subtitle}</p>}

        {winner && (
          <div className="victory-winner-card">
            <p className="victory-winner-label">
              {soloFinish ? "Ваш счёт" : isDraw ? "Ничья" : "Победитель"}
            </p>
            <p className="victory-winner-name">{winner.username}</p>
            <p className="victory-winner-score">{winner.score} очков</p>
          </div>
        )}

        <ul className="player-list victory-players">
          {players.map((player, index) => (
            <li
              className={`player-card victory-player-card ${
                index === 0 && !isDraw ? "victory-player-winner" : ""
              }`}
              key={player.user_id}
              style={{ animationDelay: `${0.15 + index * 0.1}s` }}
            >
              <strong>
                {index === 0 && !isDraw ? "🥇 " : index === 1 ? "🥈 " : ""}
                {player.username}
              </strong>
              <span className="victory-total-score">{player.score} очков</span>
            </li>
          ))}
        </ul>

        <div className="stack stack-center victory-actions">
          <Button variant="primary" block onClick={onHome}>
            На главную
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
