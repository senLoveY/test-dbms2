import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, loadRoomSession, saveRoomSession } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

/** Safety-net polling: fast while realtime is down, slow once it's connected. */
const POLL_FALLBACK_MS = 1500;
const POLL_REALTIME_MS = 6000;
const EVENT_DEBOUNCE_MS = 40;

/**
 * Live room state by room code.
 * - Realtime events trigger a (debounced, coalesced) refresh.
 * - Game actions return the new state directly, so the UI updates in one round trip.
 * - Responses are applied in request order, so a slow poll can't roll the UI back.
 */
export function useRoomState(code) {
  const [roomId, setRoomId] = useState(() => loadRoomSession(code));
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState(false);

  const seqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const apply = useCallback(
    (seq, next, sentAt) => {
      if (!next?.room || seq < appliedSeqRef.current) return;
      appliedSeqRef.current = seq;
      if (next.serverTime) {
        // assume the server answered halfway through the round trip
        const midpoint = (sentAt + Date.now()) / 2;
        clockOffsetRef.current = next.serverTime - midpoint;
      }
      if (next.room.id !== roomIdRef.current) {
        saveRoomSession(code, next.room.id);
        setRoomId(next.room.id);
      }
      setState(next);
      setError("");
    },
    [code]
  );

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    const seq = ++seqRef.current;
    const sentAt = Date.now();
    const id = roomIdRef.current;
    const query = id ? `roomId=${encodeURIComponent(id)}` : `code=${encodeURIComponent(code)}`;
    try {
      apply(seq, await apiRequest(`/api/rooms/state?${query}`), sentAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        refresh();
      }
    }
  }, [apply, code]);

  /** POST a game/room action and render the state it returns. */
  const act = useCallback(
    async (path, body = {}) => {
      const seq = ++seqRef.current;
      const sentAt = Date.now();
      const data = await apiRequest(path, {
        method: "POST",
        body: { roomId: roomIdRef.current, ...body },
      });
      if (data.state) apply(seq, data.state, sentAt);
      return data;
    },
    [apply]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription
  useEffect(() => {
    if (!roomId || !supabase) return undefined;

    let timer = null;
    const onEvent = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, EVENT_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        onEvent
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        onEvent
      )
      .subscribe((status) => {
        setRealtime(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      clearTimeout(timer);
      setRealtime(false);
      supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  // Polling safety net + refresh when the tab comes back
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, realtime ? POLL_REALTIME_MS : POLL_FALLBACK_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [realtime, refresh]);

  const now = useCallback(() => Date.now() + clockOffsetRef.current, []);

  return { state, error, loading, refresh, act, roomId, now };
}
