import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, adminPasswordOk, makeAdminSession } from "@/lib/server/security";
import { handle, json, limited, readJson } from "@/lib/server/http";
import { GameError } from "@/lib/server/game";

export async function POST(req: Request) {
  return handle(async () => {
    limited(req, "admin-login", 8, 10 * 60_000);
    const body = await readJson(req);
    if (!adminPasswordOk(String(body.password ?? ""))) throw new GameError(401, "Wrong password.");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, makeAdminSession(), adminCookieOptions);
    return res;
  });
}

export async function DELETE() {
  const res = json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions, maxAge: 0 });
  return res;
}
