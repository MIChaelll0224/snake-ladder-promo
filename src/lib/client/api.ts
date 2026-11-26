"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const tokenKey = (code: string) => `sl:token:${code.toUpperCase()}`;

export function getToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}
export function setToken(code: string, token: string) {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {
    /* private mode */
  }
}
export function clearToken(code: string) {
  try {
    localStorage.removeItem(tokenKey(code));
  } catch {
    /* ignore */
  }
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem("sl:device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("sl:device", id);
    }
    return id;
  } catch {
    return "";
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { "x-player-token": opts.token } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function ctaHref(campaignId: string, ctaId: string, roomCode?: string, playerId?: string | null) {
  const q = new URLSearchParams({ c: campaignId, id: ctaId });
  if (roomCode) q.set("r", roomCode);
  if (playerId) q.set("p", playerId);
  return `/api/cta?${q.toString()}`;
}
