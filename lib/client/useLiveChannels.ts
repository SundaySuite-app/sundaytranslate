"use client";

import { useCallback, useEffect, useState } from "react";
import { useChannel } from "@/lib/client/useChannel";
import { channels as rtChannels, events } from "@/lib/realtime";
import type { ChannelView } from "@/lib/types";

interface Live {
  channels: ChannelView[];
  status: "live" | "ended";
  connected: boolean;
  refetch: () => void;
}

/** Subscribe to a session's channel list: realtime broadcast for instant
 * updates, polling as the safety net (15s healthy / 3s while disconnected),
 * mirroring the SundayStage pattern. */
export function useLiveChannels(sessionId: string | null): Live {
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [status, setStatus] = useState<"live" | "ended">("live");

  const refetch = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/channels`);
      if (!res.ok) return;
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch {
      /* ignore — polling will retry */
    }
  }, [sessionId]);

  const connected = useChannel(
    sessionId ? rtChannels.session(sessionId) : null,
    (event, payload) => {
      if (event === events.session && payload.status === "ended") setStatus("ended");
      else refetch();
    },
    refetch,
  );

  // Polling safety net (15s healthy / 3s while disconnected).
  useEffect(() => {
    if (!sessionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, not a sync setState
    refetch();
    const id = setInterval(refetch, connected ? 15_000 : 3_000);
    return () => clearInterval(id);
  }, [sessionId, connected, refetch]);

  return { channels, status, connected, refetch };
}
