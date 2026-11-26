// In-memory store for local development and automated tests.
// Data is persisted to .data/dev-db.json so restarts keep your campaigns.
// It only works in ONE server process (next dev / next start) - use Supabase on Vercel.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Campaign, ConsentRecord, CtaClick, GameLog, GameStateRow, Participant, PlayerRecord, Room, Winner } from "../types";
import { defaultCampaign, normalizeCampaign } from "../defaults";
import type { Metrics, Store } from "./types";

interface Db {
  campaigns: Campaign[];
  rooms: Room[];
  states: GameStateRow[];
  players: PlayerRecord[];
  logs: GameLog[];
  participants: Participant[];
  consents: ConsentRecord[];
  winners: Winner[];
  clicks: CtaClick[];
  logSeq: number;
}

const FILE = path.join(process.cwd(), ".data", "dev-db.json");
const now = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

function load(): Db {
  try {
    if (process.env.MEMORY_STORE_PERSIST !== "0" && fs.existsSync(FILE)) {
      const db = JSON.parse(fs.readFileSync(FILE, "utf8")) as Db;
      // older saved configs are merged onto the current defaults
      db.campaigns = db.campaigns.map((c) => ({ ...normalizeCampaign(c as Campaign & Record<string, unknown>), id: c.id, createdAt: c.createdAt, updatedAt: c.updatedAt }));
      return db;
    }
  } catch {
    /* start fresh */
  }
  const demo = defaultCampaign({ id: randomUUID() });
  return { campaigns: [demo], rooms: [], states: [], players: [], logs: [], participants: [], consents: [], winners: [], clicks: [], logSeq: 0 };
}

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private db: Db = load();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private touch() {
    if (process.env.MEMORY_STORE_PERSIST === "0") return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        // keep the dev file small
        if (this.db.logs.length > 5000) this.db.logs = this.db.logs.slice(-3000);
        fs.writeFileSync(FILE, JSON.stringify(this.db));
      } catch {
        /* ignore */
      }
    }, 500);
  }

  async listCampaigns() {
    return clone([...this.db.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async getCampaign(id: string) {
    return clone(this.db.campaigns.find((c) => c.id === id) ?? null);
  }
  async getCampaignBySlug(slug: string) {
    return clone(this.db.campaigns.find((c) => c.slug === slug) ?? null);
  }
  async insertCampaign(c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) {
    if (this.db.campaigns.some((x) => x.slug === c.slug)) throw new Error("A campaign with this slug already exists");
    const row: Campaign = { ...clone(c), id: randomUUID(), createdAt: now(), updatedAt: now() };
    this.db.campaigns.push(row);
    this.touch();
    return clone(row);
  }
  async updateCampaign(id: string, c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) {
    const i = this.db.campaigns.findIndex((x) => x.id === id);
    if (i < 0) throw new Error("Campaign not found");
    if (this.db.campaigns.some((x) => x.slug === c.slug && x.id !== id)) throw new Error("A campaign with this slug already exists");
    this.db.campaigns[i] = { ...clone(c), id, createdAt: this.db.campaigns[i].createdAt, updatedAt: now() };
    this.touch();
    return clone(this.db.campaigns[i]);
  }
  async deleteCampaign(id: string) {
    const roomIds = new Set(this.db.rooms.filter((r) => r.campaignId === id).map((r) => r.id));
    this.db.campaigns = this.db.campaigns.filter((c) => c.id !== id);
    this.db.rooms = this.db.rooms.filter((r) => r.campaignId !== id);
    this.db.states = this.db.states.filter((s) => !roomIds.has(s.roomId));
    this.db.players = this.db.players.filter((p) => p.campaignId !== id);
    this.db.logs = this.db.logs.filter((l) => !roomIds.has(l.roomId));
    this.db.participants = this.db.participants.filter((p) => p.campaignId !== id);
    this.db.consents = this.db.consents.filter((p) => p.campaignId !== id);
    this.db.winners = this.db.winners.filter((p) => p.campaignId !== id);
    this.db.clicks = this.db.clicks.filter((p) => p.campaignId !== id);
    this.touch();
  }

  async createRoom(r: { code: string; campaignId: string; hostedByAdmin: boolean }, state: GameStateRow["state"]) {
    if (this.db.rooms.some((x) => x.code === r.code)) throw new Error("duplicate room code");
    const room: Room = { id: randomUUID(), code: r.code, campaignId: r.campaignId, hostedByAdmin: r.hostedByAdmin, status: "lobby", gamesPlayed: 0, createdAt: now(), updatedAt: now() };
    this.db.rooms.push(room);
    this.db.states.push({ roomId: room.id, version: 0, state: clone(state), updatedAt: now() });
    this.touch();
    return clone(room);
  }
  async getRoomByCode(code: string) {
    return clone(this.db.rooms.find((r) => r.code === code) ?? null);
  }
  async listRooms(campaignId?: string, limit = 100) {
    return clone(
      this.db.rooms
        .filter((r) => !campaignId || r.campaignId === campaignId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }
  async updateRoom(id: string, patch: Partial<Pick<Room, "status" | "gamesPlayed">>) {
    const r = this.db.rooms.find((x) => x.id === id);
    if (r) Object.assign(r, patch, { updatedAt: now() });
    this.touch();
  }
  async getGameState(roomId: string) {
    return clone(this.db.states.find((s) => s.roomId === roomId) ?? null);
  }
  async casGameState(roomId: string, expectedVersion: number, state: GameStateRow["state"]) {
    const s = this.db.states.find((x) => x.roomId === roomId);
    if (!s || s.version !== expectedVersion) return false;
    s.version += 1;
    s.state = clone(state);
    s.updatedAt = now();
    this.touch();
    return true;
  }

  async insertPlayer(p: Parameters<Store["insertPlayer"]>[0]) {
    const row: PlayerRecord = { ...clone(p), joinedAt: now(), lastSeenAt: now(), leftAt: null, finalPosition: null, finalRank: null };
    this.db.players.push(row);
    this.touch();
    return clone(row);
  }
  async getPlayerByToken(roomId: string, tokenHash: string) {
    return clone(this.db.players.find((p) => p.roomId === roomId && p.tokenHash === tokenHash) ?? null);
  }
  async listPlayers(roomId: string) {
    return clone(this.db.players.filter((p) => p.roomId === roomId));
  }
  async listCampaignPlayers(campaignId: string) {
    return clone(this.db.players.filter((p) => p.campaignId === campaignId));
  }
  async updatePlayer(id: string, patch: Partial<Pick<PlayerRecord, "lastSeenAt" | "leftAt" | "finalPosition" | "finalRank">>) {
    const p = this.db.players.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    this.touch();
  }

  async addLogs(logs: Omit<GameLog, "id" | "createdAt">[]) {
    for (const l of logs) this.db.logs.push({ ...clone(l), id: ++this.db.logSeq, createdAt: now() });
    this.touch();
  }
  async listLogs(roomId: string, limit: number) {
    const out: GameLog[] = [];
    for (let i = this.db.logs.length - 1; i >= 0 && out.length < limit; i--) if (this.db.logs[i].roomId === roomId) out.push(this.db.logs[i]);
    return clone(out);
  }

  async findParticipantByDevice(campaignId: string, deviceId: string) {
    return clone(this.db.participants.find((p) => p.campaignId === campaignId && p.deviceId === deviceId && !p.anonymizedAt) ?? null);
  }
  async insertParticipant(p: Omit<Participant, "id" | "createdAt" | "anonymizedAt">) {
    const row: Participant = { ...clone(p), id: randomUUID(), createdAt: now(), anonymizedAt: null };
    this.db.participants.push(row);
    this.touch();
    return clone(row);
  }
  async updateParticipant(id: string, patch: Partial<Pick<Participant, "name" | "email" | "phone" | "extra" | "marketingConsent">>) {
    const p = this.db.participants.find((x) => x.id === id);
    if (p) Object.assign(p, clone(patch));
    this.touch();
  }
  async listParticipants(campaignId: string) {
    return clone(this.db.participants.filter((p) => p.campaignId === campaignId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async addConsent(c: Omit<ConsentRecord, "id" | "createdAt">) {
    this.db.consents.push({ ...clone(c), id: randomUUID(), createdAt: now() });
    this.touch();
  }
  async purgeExpired(campaignId: string, retentionDays: number) {
    const cutoff = Date.now() - retentionDays * 86400_000;
    let n = 0;
    for (const p of this.db.participants) {
      if (p.campaignId === campaignId && !p.anonymizedAt && new Date(p.createdAt).getTime() < cutoff) {
        Object.assign(p, { name: null, email: null, phone: null, extra: {}, deviceId: null, anonymizedAt: now() });
        n++;
      }
    }
    this.touch();
    return n;
  }

  async addWinners(w: Omit<Winner, "id" | "createdAt">[]) {
    for (const x of w) {
      if (this.db.winners.some((y) => y.roomId === x.roomId && y.round === x.round && y.playerId === x.playerId)) continue;
      this.db.winners.push({ ...clone(x), id: randomUUID(), createdAt: now() });
    }
    this.touch();
  }
  async listWinners(campaignId?: string, limit = 500) {
    return clone(
      this.db.winners
        .filter((w) => !campaignId || w.campaignId === campaignId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }
  async getWinner(roomId: string, round: number, playerId: string) {
    return clone(this.db.winners.find((w) => w.roomId === roomId && w.round === round && w.playerId === playerId) ?? null);
  }
  async addClick(c: Omit<CtaClick, "id" | "createdAt">) {
    this.db.clicks.push({ ...clone(c), id: randomUUID(), createdAt: now() });
    this.touch();
  }

  async metrics(campaignId?: string): Promise<Metrics> {
    const f = <T extends { campaignId: string }>(a: T[]) => a.filter((x) => !campaignId || x.campaignId === campaignId);
    const rooms = f(this.db.rooms);
    const clicks = f(this.db.clicks);
    const clicksByCta: Record<string, number> = {};
    for (const c of clicks) clicksByCta[c.ctaId] = (clicksByCta[c.ctaId] ?? 0) + 1;
    const players = f(this.db.players);
    const parts = f(this.db.participants);
    const uniq = new Set(players.map((p) => p.participantId ?? p.deviceId ?? p.id));
    return {
      players: players.length,
      uniqueParticipants: uniq.size,
      gamesPlayed: rooms.reduce((s, r) => s + r.gamesPlayed, 0),
      winners: f(this.db.winners).length,
      ctaClicks: clicks.length,
      consents: parts.filter((p) => p.marketingConsent).length,
      rooms: rooms.length,
      clicksByCta,
    };
  }
}
