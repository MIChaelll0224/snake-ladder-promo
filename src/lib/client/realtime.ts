"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export const realtimeEnabled = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Subscribes to the room's broadcast channel. Returns an unsubscribe function. */
export function subscribeRoom(code: string, onUpdate: () => void): () => void {
  if (!realtimeEnabled()) return () => {};
  if (client === undefined) {
    try {
      client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch {
      client = null;
    }
  }
  if (!client) return () => {};
  const channel = client.channel(`room-${code}`).on("broadcast", { event: "update" }, () => onUpdate()).subscribe();
  return () => {
    void client?.removeChannel(channel);
  };
}
