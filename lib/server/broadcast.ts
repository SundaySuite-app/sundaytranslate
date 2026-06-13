import "server-only";

// Server-side Supabase Realtime broadcast via the REST endpoint — lets a
// stateless Route Handler push an event to a channel without holding a
// websocket. Clients subscribed to `topic` receive it.
//
// Failures are swallowed (logged): realtime is a hint layer; a lost broadcast
// is healed by the client refetching authoritative state on its next action or
// reconnect.

export async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
    if (!res.ok) console.warn("[broadcast] failed", topic, event, res.status);
  } catch (err) {
    console.warn("[broadcast] error", topic, event, err);
  }
}
