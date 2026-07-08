"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Handler = (event: string, payload: Record<string, unknown>) => void;

/** Subscribe to a Supabase Realtime channel and invoke `onEvent` for every
 * broadcast event. Reports whether the socket is currently SUBSCRIBED so
 * consumers can fast-poll while disconnected and refetch on every (re)connect.
 * Handlers live in refs — no memoisation needed. */
export function useChannel(
  topic: string | null,
  onEvent: Handler,
  onConnected?: () => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  const connectedRef = useRef(onConnected);
  useEffect(() => {
    handlerRef.current = onEvent;
    connectedRef.current = onConnected;
  });

  useEffect(() => {
    if (!topic) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const channel = supabase.channel(topic, {
      // private: Realtime authorizes each subscriber against the realtime.messages
      // RLS policy (migration 20260708120000). anon/authenticated may RECEIVE on
      // translator:session:* but cannot .send() forged events — closing the spoof
      // hole where anyone who learns a session id could fake e.g. AI captions on
      // the storskjerm. Server publish (lib/server/broadcast.ts) is unaffected —
      // it uses the service_role REST endpoint, which bypasses RLS.
      config: { broadcast: { self: false }, private: true },
    });

    channel.on("broadcast", { event: "*" }, (msg) => {
      handlerRef.current(
        (msg.event as string) ?? "",
        (msg.payload as Record<string, unknown>) ?? {},
      );
    });
    channel.subscribe((status) => {
      const up = status === "SUBSCRIBED";
      setConnected(up);
      if (up) connectedRef.current?.();
    });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [topic]);

  return connected;
}
