import "server-only";

/**
 * Tells every browser in the room that the state changed (Supabase Realtime Broadcast).
 * Payload is only a version number - clients then fetch the state through the API,
 * so no private data ever goes over the public channel.
 */
export async function broadcastRoom(code: string, version: number): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return; // memory mode: clients poll
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: `room-${code}`, event: "update", payload: { v: version } }] }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    /* clients also poll as a fallback */
  }
}
