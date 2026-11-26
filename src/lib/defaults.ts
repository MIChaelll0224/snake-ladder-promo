import type {
  BoardLayout,
  Branding,
  Campaign,
  CampaignContent,
  CouponConfig,
  Cta,
  GameConfig,
  Milestone,
  RegistrationConfig,
  RegistrationField,
} from "./types";

export const PLAYER_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
];

export const AVATARS = ["🦁", "🐯", "🐼", "🦊", "🐸", "🐵", "🐰", "🐨", "🐧", "🦄", "🐙", "🐲", "🐝", "🦖", "🐱", "🐶"];

export const MAX_PLAYERS_LIMIT = 10;

export const DEFAULT_BRANDING: Branding = {
  logoUrl: "",
  primary: "#7c3aed",
  secondary: "#f59e0b",
  accent: "#10b981",
  background: "#1e1b4b",
  backgroundImageUrl: "",
  bannerImageUrl: "",
  bannerText: "Play. Climb. Win!",
  sponsorLogos: [],
};

export const DEFAULT_CONTENT: CampaignContent = {
  headline: "Snake & Ladder Promo",
  tagline: "Race to 100 and win exclusive prizes!",
  welcomeMessage:
    "Join a room with up to 10 players. Take turns rolling the dice on one shared board — climb the ladders, dodge the snakes and be the first to reach 100!",
  mechanics: [
    "Type your name and join a room using the code, link or QR.",
    "Tap READY. The host starts the game once everyone is ready.",
    "When it's your turn, tap ROLL. If time runs out, the computer rolls for you.",
    "Ladders take you up, snakes slide you down. You must land exactly on 100 — extra steps bounce you back. First to 100 wins!",
  ],
  prizeTitle: "Grand Prize",
  prizeDetails: "Winners receive an exclusive discount voucher. Show your winning code at our store or use it online.",
  winnerMessage: "Congratulations! You conquered the board!",
  loserMessage: "So close! Thanks for playing — here is something for you anyway.",
  privacyNotice:
    "We collect the information you enter (nickname and any registration details) only to run this promo, announce winners and send prizes. " +
    "Marketing messages are sent only if you tick the consent box. You can ask us to delete your data at any time. " +
    "Registration data is automatically anonymised after the retention period of this campaign.",
  consentText: "Yes, send me news, promos and offers. (Optional — you can still play without ticking this.)",
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxPlayers: 10,
  minPlayers: 2,
  turnSeconds: 20,
  startCountdownSec: 5,
  diceMax: 6,
  finishRule: "bounce",
  extraTurnOnSix: false,
  winnersCount: 1,
  snakesCount: 12,
  laddersCount: 7,
  customLayouts: [],
  allowSpectators: true,
  allowPlayerHosting: true,
};

export const DEFAULT_FIELDS: RegistrationField[] = [
  { key: "name", label: "Full name", type: "text", enabled: true, required: false },
  { key: "email", label: "Email", type: "email", enabled: true, required: false },
  { key: "phone", label: "Mobile number", type: "tel", enabled: true, required: false },
  { key: "city", label: "City", type: "text", enabled: false, required: false },
];

export const DEFAULT_REGISTRATION: RegistrationConfig = {
  enabled: false, // name-only join by default; turn on in the admin to collect details
  fields: DEFAULT_FIELDS,
  consentEnabled: true,
};

export const DEFAULT_CTAS: Cta[] = [
  { id: "facebook", label: "Visit Our Facebook Page", url: "https://facebook.com", style: "primary", showOn: ["landing", "lobby", "finish"] },
  { id: "website", label: "Visit Our Website", url: "https://example.com", style: "outline", showOn: ["landing", "finish"] },
  { id: "reward", label: "Claim Your Reward", url: "https://example.com/rewards", style: "secondary", showOn: ["finish"] },
];

export const DEFAULT_MILESTONES: Milestone[] = [
  { id: "m50", trigger: "square", value: 50, title: "Halfway there! 🎉", message: "You reached square 50. Keep going — the prize is waiting!" },
  { id: "mladder", trigger: "ladder", title: "Level up! 🪜", message: "Nice climb! Our products help you climb faster too." },
];

export const DEFAULT_COUPON: CouponConfig = {
  enabled: true,
  prefix: "WIN",
  winnerOnly: false,
  participationCode: "THANKYOU10",
  prizeByRank: ["Grand Prize: ₱1,000 voucher", "2nd Prize: ₱500 voucher", "3rd Prize: ₱250 voucher"],
};

export function defaultCampaign(overrides: Partial<Campaign> = {}): Campaign {
  const now = new Date().toISOString();
  return {
    id: "",
    slug: "demo",
    name: "Demo Snake & Ladder Promo",
    businessName: "Your Brand",
    status: "active",
    startsAt: null,
    endsAt: null,
    branding: { ...DEFAULT_BRANDING },
    content: { ...DEFAULT_CONTENT, mechanics: [...DEFAULT_CONTENT.mechanics] },
    gameConfig: { ...DEFAULT_GAME_CONFIG },
    registration: { ...DEFAULT_REGISTRATION, fields: DEFAULT_FIELDS.map((f) => ({ ...f })) },
    ctas: DEFAULT_CTAS.map((c) => ({ ...c, showOn: [...c.showOn] })),
    milestones: DEFAULT_MILESTONES.map((m) => ({ ...m })),
    coupon: { ...DEFAULT_COUPON, prizeByRank: [...DEFAULT_COUPON.prizeByRank] },
    retentionDays: 180,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------- normalisation / validation
// Admin input and DB JSON are merged onto defaults and clamped, so the game
// engine always gets a valid config.

const str = (v: unknown, fallback: string, max = 2000) =>
  typeof v === "string" ? v.slice(0, max) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const color = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
export const safeUrl = (v: unknown): string => {
  if (typeof v !== "string" || !v.trim()) return "";
  const s = v.trim();
  if (s.startsWith("/")) return s.slice(0, 1000);
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 1000) : "";
  } catch {
    return "";
  }
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function normalizeLayout(v: unknown): BoardLayout | null {
  const o = obj(v);
  const pairs = (a: unknown, up: boolean) =>
    arr(a)
      .map((p) => arr(p).map((n) => Number(n)))
      .filter((p) => p.length === 2 && p.every((n) => Number.isInteger(n) && n > 1 && n < 100))
      .filter((p) => (up ? p[0] < p[1] : p[0] > p[1]))
      .map((p) => [p[0], p[1]] as [number, number]);
  const snakes = pairs(o.snakes, false);
  const ladders = pairs(o.ladders, true);
  const ends = new Set<number>();
  for (const [a] of [...snakes, ...ladders]) {
    if (ends.has(a)) return null; // two shortcuts starting on the same square
    ends.add(a);
  }
  if (!snakes.length && !ladders.length) return null;
  return { snakes: snakes.slice(0, 20), ladders: ladders.slice(0, 20) };
}

export function normalizeCampaign(input: Partial<Campaign> & Record<string, unknown>, base?: Campaign): Campaign {
  const d = base ?? defaultCampaign();
  const b = obj(input.branding);
  const c = obj(input.content);
  const g = obj(input.gameConfig);
  const r = obj(input.registration);
  const cp = obj(input.coupon);

  const maxPlayers = int(g.maxPlayers, d.gameConfig.maxPlayers, 2, MAX_PLAYERS_LIMIT);

  const fieldsIn = arr(r.fields);
  const fields: RegistrationField[] = (fieldsIn.length ? fieldsIn : d.registration.fields)
    .map((f) => obj(f))
    .filter((f) => typeof f.key === "string" && /^[a-z][a-z0-9_]{0,30}$/.test(f.key as string))
    .slice(0, 12)
    .map((f) => ({
      key: f.key as string,
      label: str(f.label, f.key as string, 60),
      type: (["text", "email", "tel", "select"].includes(f.type as string) ? f.type : "text") as RegistrationField["type"],
      enabled: bool(f.enabled, true),
      required: bool(f.required, false),
      options: arr(f.options).map((o) => String(o).slice(0, 60)).slice(0, 20),
    }));

  const ctas: Cta[] = arr(input.ctas ?? d.ctas)
    .map((x) => obj(x))
    .filter((x) => typeof x.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(x.id as string))
    .slice(0, 8)
    .map((x) => ({
      id: x.id as string,
      label: str(x.label, "Learn more", 60),
      url: safeUrl(x.url),
      style: (["primary", "secondary", "outline"].includes(x.style as string) ? x.style : "primary") as Cta["style"],
      showOn: arr(x.showOn).filter((s): s is Cta["showOn"][number] =>
        ["landing", "lobby", "game", "finish"].includes(s as string),
      ),
    }));

  const milestones: Milestone[] = arr(input.milestones ?? d.milestones)
    .map((x) => obj(x))
    .slice(0, 12)
    .map((x, i) => ({
      id: str(x.id, `m${i}`, 40) || `m${i}`,
      trigger: (["square", "ladder", "snake", "finish"].includes(x.trigger as string) ? x.trigger : "square") as Milestone["trigger"],
      value: x.value == null || x.value === "" ? undefined : int(x.value, 50, 1, 100),
      title: str(x.title, "", 80),
      message: str(x.message, "", 400),
      ctaId: typeof x.ctaId === "string" && x.ctaId ? x.ctaId.slice(0, 40) : undefined,
    }))
    .filter((m) => m.title || m.message);

  const layouts = arr(g.customLayouts ?? d.gameConfig.customLayouts)
    .map(normalizeLayout)
    .filter((l): l is BoardLayout => !!l)
    .slice(0, 20);

  const slugIn = str(input.slug, d.slug, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

  return {
    ...d,
    id: str(input.id, d.id, 64),
    slug: slugIn.length >= 2 ? slugIn : d.slug,
    name: str(input.name, d.name, 120) || d.name,
    businessName: str(input.businessName, d.businessName, 120),
    status: (["draft", "active", "archived"].includes(input.status as string) ? input.status : d.status) as Campaign["status"],
    startsAt: input.startsAt === undefined ? d.startsAt : dateOrNull(input.startsAt),
    endsAt: input.endsAt === undefined ? d.endsAt : dateOrNull(input.endsAt),
    branding: {
      logoUrl: safeUrl(b.logoUrl ?? d.branding.logoUrl),
      primary: color(b.primary, d.branding.primary),
      secondary: color(b.secondary, d.branding.secondary),
      accent: color(b.accent, d.branding.accent),
      background: color(b.background, d.branding.background),
      backgroundImageUrl: safeUrl(b.backgroundImageUrl ?? d.branding.backgroundImageUrl),
      bannerImageUrl: safeUrl(b.bannerImageUrl ?? d.branding.bannerImageUrl),
      bannerText: str(b.bannerText, d.branding.bannerText, 140),
      sponsorLogos: arr(b.sponsorLogos ?? d.branding.sponsorLogos)
        .map((s) => obj(s))
        .slice(0, 12)
        .map((s) => ({ name: str(s.name, "", 60), logoUrl: safeUrl(s.logoUrl), url: safeUrl(s.url) }))
        .filter((s) => s.name || s.logoUrl),
    },
    content: {
      headline: str(c.headline, d.content.headline, 120),
      tagline: str(c.tagline, d.content.tagline, 200),
      welcomeMessage: str(c.welcomeMessage, d.content.welcomeMessage, 1000),
      mechanics: (Array.isArray(c.mechanics) ? c.mechanics : d.content.mechanics)
        .map((m) => String(m).slice(0, 300))
        .filter(Boolean)
        .slice(0, 12),
      prizeTitle: str(c.prizeTitle, d.content.prizeTitle, 120),
      prizeDetails: str(c.prizeDetails, d.content.prizeDetails, 1000),
      winnerMessage: str(c.winnerMessage, d.content.winnerMessage, 400),
      loserMessage: str(c.loserMessage, d.content.loserMessage, 400),
      privacyNotice: str(c.privacyNotice, d.content.privacyNotice, 5000),
      consentText: str(c.consentText, d.content.consentText, 500),
    },
    gameConfig: {
      maxPlayers,
      minPlayers: int(g.minPlayers, d.gameConfig.minPlayers, 1, maxPlayers),
      turnSeconds: int(g.turnSeconds, d.gameConfig.turnSeconds, 5, 120),
      startCountdownSec: int(g.startCountdownSec, d.gameConfig.startCountdownSec, 0, 30),
      diceMax: int(g.diceMax, d.gameConfig.diceMax, 4, 12),
      extraTurnOnSix: bool(g.extraTurnOnSix, d.gameConfig.extraTurnOnSix),
      finishRule: (["bounce", "exact", "any"].includes(g.finishRule as string)
        ? g.finishRule
        : d.gameConfig.finishRule) as GameConfig["finishRule"],
      winnersCount: int(g.winnersCount, d.gameConfig.winnersCount, 1, maxPlayers),
      snakesCount: int(g.snakesCount, d.gameConfig.snakesCount, 0, 14),
      laddersCount: int(g.laddersCount, d.gameConfig.laddersCount, 0, 14),
      customLayouts: layouts,
      allowSpectators: bool(g.allowSpectators, d.gameConfig.allowSpectators),
      allowPlayerHosting: bool(g.allowPlayerHosting, d.gameConfig.allowPlayerHosting),
    },
    registration: {
      enabled: bool(r.enabled, d.registration.enabled),
      fields,
      consentEnabled: bool(r.consentEnabled, d.registration.consentEnabled),
    },
    ctas,
    milestones,
    coupon: {
      enabled: bool(cp.enabled, d.coupon.enabled),
      prefix: str(cp.prefix, d.coupon.prefix, 12).toUpperCase().replace(/[^A-Z0-9]/g, "") || "WIN",
      winnerOnly: bool(cp.winnerOnly, d.coupon.winnerOnly),
      participationCode: str(cp.participationCode, d.coupon.participationCode, 40),
      prizeByRank: (Array.isArray(cp.prizeByRank) ? cp.prizeByRank : d.coupon.prizeByRank)
        .map((p) => String(p).slice(0, 200))
        .slice(0, 10),
    },
    retentionDays: int(input.retentionDays, d.retentionDays, 1, 3650),
  };
}

function dateOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function campaignOpenState(c: Campaign, now = Date.now()): { open: boolean; reason: string | null } {
  if (c.status !== "active") return { open: false, reason: c.status === "draft" ? "This promo is not live yet." : "This promo has ended." };
  if (c.startsAt && now < new Date(c.startsAt).getTime())
    return { open: false, reason: `This promo starts on ${new Date(c.startsAt).toLocaleString("en-PH")}.` };
  if (c.endsAt && now > new Date(c.endsAt).getTime()) return { open: false, reason: "This promo has ended. Thank you for joining!" };
  return { open: true, reason: null };
}
