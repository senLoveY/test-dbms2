import { useEffect, useState } from "react";

export function CountdownBar({ startedAt, endsAt, now, tone = "default" }) {
  const total = Math.max(1, endsAt - startedAt);
  const elapsed = Math.min(total, Math.max(0, now() - startedAt));
  return (
    <div className={`countdown countdown-${tone}`} aria-hidden="true">
      <span
        key={`${startedAt}-${endsAt}`}
        style={{ "--d": `${total}ms`, "--delay": `-${elapsed}ms` }}
      />
    </div>
  );
}

/** Seconds until the deadline, derived during render so it's never stale after a question change. */
export function useSecondsLeft(deadline, now, active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !deadline) return undefined;
    const id = setInterval(() => setTick((value) => value + 1), 200);
    return () => clearInterval(id);
  }, [deadline, active]);
  if (!active || !deadline) return 0;
  return Math.max(0, Math.ceil((deadline - now()) / 1000));
}
