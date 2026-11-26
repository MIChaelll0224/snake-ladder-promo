import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const DEV_SECRET = "dev-only-secret-change-me";

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production" && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("APP_SECRET must be set (16+ chars) in production");
    }
    return DEV_SECRET;
  }
  return s;
}

export const newToken = () => randomBytes(24).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(`${appSecret()}:${token}`).digest("hex");
export const secureRandomInt = (maxExclusive: number) => randomInt(0, maxExclusive);

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newRoomCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
  return s;
}
export function newCouponCode(prefix: string) {
  let s = "";
  for (let i = 0; i < 6; i++) s += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
  return `${prefix}-${s}`;
}

// ---------------------------------------------------------------- admin session (signed cookie)

export const ADMIN_COOKIE = "sl_admin";
const SESSION_HOURS = 12;

function sign(payload: string) {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function adminPasswordOk(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "admin");
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function makeAdminSession(): string {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSession(value: string | undefined | null): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const sig = Buffer.from(parts[2]);
  const good = Buffer.from(sign(payload));
  if (sig.length !== good.length || !timingSafeEqual(sig, good)) return false;
  return Number(parts[1]) > Date.now();
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminSession(jar.get(ADMIN_COOKIE)?.value);
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_HOURS * 3600,
};
