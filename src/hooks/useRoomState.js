import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

/** Fallback polling when Realtime is off or RLS blocks events */
const POLL_MS = 1500;

export function useRoomState(roomId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const data = await apiRequest(`/api/rooms/state?roomId=${roomId}`);
      setState(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const pull = () => {
      if (!cancelled) refresh();
    };

    pull();
    const pollId = setInterval(pull, POLL_MS);

    let channel = null;
    if (supabase) {
      channel = supabase
        .channel(`room:${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          pull
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "room_players",
            filter: `room_id=eq.${roomId}`,
          },
          pull
        )
        .subscribe((status, err) => {
          if (import.meta.env.DEV && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
            console.warn("[useRoomState] Realtime:", status, err);
          }
        });
    }

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { state, error, loading, refresh };
}
