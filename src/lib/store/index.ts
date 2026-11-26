import "server-only";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

const g = globalThis as unknown as { __slStore?: Store };

export function supabaseConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Returns the Supabase store when configured, else a single-process in-memory store. */
export function getStore(): Store {
  if (!g.__slStore) {
    g.__slStore = supabaseConfigured()
      ? new SupabaseStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      : new MemoryStore();
  }
  return g.__slStore;
}
