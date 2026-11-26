import "server-only";
import { NextResponse } from "next/server";
import { GameError } from "./game";
import { isAdmin } from "./security";
import { clientIp, rateLimit } from "./ratelimit";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

export function limited(req: Request, bucket: string, limit: number, windowMs: number) {
  if (!rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs)) throw new GameError(429, "Too many requests — slow down a little.");
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new GameError(401, "Admin login required.");
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 200_000) throw new GameError(413, "Request too large.");
  try {
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    throw new GameError(400, "Invalid JSON.");
  }
}

export const playerToken = (req: Request) => req.headers.get("x-player-token");

export function joinInput(req: Request, body: Record<string, unknown>) {
  return {
    nickname: String(body.nickname ?? ""),
    avatar: String(body.avatar ?? ""),
    deviceId: String(body.deviceId ?? ""),
    fields: (body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {}) as Record<string, string>,
    consent: body.consent === true ? true : body.consent === false ? false : undefined,
    userAgent: req.headers.get("user-agent"),
  };
}
