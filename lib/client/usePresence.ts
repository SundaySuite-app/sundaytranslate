"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Anonymous listener presence over Supabase Realtime — gives the operator a
// live head-count without accounts or cookies. Best-effort: if realtime is
// down the count just reads 0 and nothing else breaks (audio is WebRTC).

/** Join a presence topic as one anonymous participant while `on` is true.
 * Used by the listener page; no payload beyond a random ephemeral key. */
export function usePresenceTrack(topic: string | null, on: boolean): void {
  useEffect(() => {
    if (!topic || !on) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const channel = supabase.channel(topic, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({}).catch(() => {});
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, on]);
}

/** Count the participants on a presence topic (the operator's head-count). */
export function usePresenceCount(topic: string | null): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!topic) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const channel = supabase.channel(topic);
    channel.on("presence", { event: "sync" }, () => {
      setCount(Object.keys(channel.presenceState()).length);
    });
    channel.subscribe();
    return () => {
      setCount(0);
      supabase.removeChannel(channel);
    };
  }, [topic]);
  return count;
}
