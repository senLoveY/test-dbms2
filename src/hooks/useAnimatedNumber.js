import { useEffect, useState } from "react";

export function useAnimatedNumber(from, to, active, durationMs = 1000) {
  const [display, setDisplay] = useState(active ? from : to);

  useEffect(() => {
    if (!active) {
      setDisplay(to);
      return undefined;
    }

    setDisplay(from);
    const delta = to - from;
    if (delta === 0) {
      setDisplay(to);
      return undefined;
    }

    const startTime = performance.now();
    let frameId;

    function tick(now) {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + delta * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [from, to, active, durationMs]);

  return display;
}
