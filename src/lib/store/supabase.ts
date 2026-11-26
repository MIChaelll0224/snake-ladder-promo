// Supabase (PostgreSQL) store. Server-only: uses the service-role key.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, ConsentRecord, CtaClick, GameLog, GameStateRow, LiveState, Participant, PlayerRecord, Room, Winner } from "../types";
import { normalizeCampaign } from "../defaults";
import type { Metrics, Store } from "./types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Untyped client: data may be null for maybeSingle()/no-select writes; callers handle that.
function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

const toCampaign = (r: Row): Campaign =>
  normalizeCampaign({
    id: r.id,
    slug: r.slug,
    name: r.name,
    businessName: r.business_name,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    branding: r.branding,
    content: r.content,
    gameConfig: r.game_config,
    registration: r.registration,
    ctas: r.ctas,
    milestones: r.milestones,
    coupon: r.coupon,
    retentionDays: r.retention_days,
  } as Partial<Campaign> & Record<string, unknown>);

const campaignRow = (c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) => ({
  slug: c.slug,
  name: c.name,
  business_name: c.businessName,
  status: c.status,
  starts_at: c.startsAt,
  ends_at: c.endsAt,
  branding: c.branding,
  content: c.content,
  game_config: c.gameConfig,
  registration: c.registration,
  ctas: c.ctas,
  milestones: c.milestones,
  coupon: c.coupon,
  retention_days: c.retentionDays,
});

const toRoom = (r: Row): Room => ({
  id: r.id,
  code: r.code,
  campaignId: r.campaign_id,
  status: r.status,
  hostedByAdmin: r.hosted_by_admin,
  gamesPlayed: r.games_played,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toPlayer = (r: Row): PlayerRecord => ({
  id: r.id,
  roomId: r.room_id,
  campaignId: r.campaign_id,
  participantId: r.participant_id,
  nickname: r.nickname,
  avatar: r.avatar,
  color: r.color,
  tokenHash: r.token_hash,
  deviceId: r.device_id,
  lastSeenAt: r.last_seen_at,
  joinedAt: r.joined_at,
  leftAt: r.left_at,
  finalPosition: r.final_position,
  finalRank: r.final_rank,
});

const toParticipant = (r: Row): Participant => ({
  id: r.id,
  campaignId: r.campaign_id,
  deviceId: r.device_id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  extra: r.extra ?? {},
  marketingConsent: r.marketing_consent,
  createdAt: r.created_at,
  anonymizedAt: r.anonymized_at,
});

const toWinner = (r: Row): Winner => ({
  id: r.id,
  campaignId: r.campaign_id,
  roomId: r.room_id,
  roomCode: r.room_code,
  round: r.round,
  playerId: r.player_id,
  participantId: r.participant_id,
  nickname: r.nickname,
  rank: r.rank,
  prize: r.prize,
  couponCode: r.coupon_code,
  createdAt: r.created_at,
});

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async listCampaigns() {
    return must(await this.sb.from("campaigns").select("*").order("created_at", { ascending: false })).map(toCampaign);
  }
  async getCampaign(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = must(await this.sb.from("campaigns").select("*").eq("id", id).maybeSingle());
    return r ? toCampaign(r) : null;
  }
  async getCampaignBySlug(slug: string) {
    const r = must(await this.sb.from("campaigns").select("*").eq("slug", slug).maybeSingle());
    return r ? toCampaign(r) : null;
  }
  async insertCampaign(c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) {
    return toCampaign(must(await this.sb.from("campaigns").insert(campaignRow(c)).select("*").single()));
  }
  async updateCampaign(id: string, c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) {
    return toCampaign(must(await this.sb.from("campaigns").update(campaignRow(c)).eq("id", id).select("*").single()));
  }
  async deleteCampaign(id: string) {
    must(await this.sb.from("campaigns").delete().eq("id", id));
  }

  async createRoom(r: { code: string; campaignId: string; hostedByAdmin: boolean }, state: LiveState) {
    const room = toRoom(
      must(await this.sb.from("rooms").insert({ code: r.code, campaign_id: r.campaignId, hosted_by_admin: r.hostedByAdmin }).select("*").single()),
    );
    must(await this.sb.from("game_states").insert({ room_id: room.id, version: 0, state }));
    return room;
  }
  async getRoomByCode(code: string) {
    const r = must(await this.sb.from("rooms").select("*").eq("code", code).maybeSingle());
    return r ? toRoom(r) : null;
  }
  async listRooms(campaignId?: string, limit = 100) {
    let q = this.sb.from("rooms").select("*").order("created_at", { ascending: false }).limit(limit);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    return must(await q).map(toRoom);
  }
  async updateRoom(id: string, patch: Partial<Pick<Room, "status" | "gamesPlayed">>) {
    const row: Row = {};
    if (patch.status) row.status = patch.status;
    if (patch.gamesPlayed != null) row.games_played = patch.gamesPlayed;
    must(await this.sb.from("rooms").update(row).eq("id", id));
  }
  async getGameState(roomId: string): Promise<GameStateRow | null> {
    const r = must(await this.sb.from("game_states").select("*").eq("room_id", roomId).maybeSingle());
    return r ? { roomId: r.room_id, version: r.version, state: r.state, updatedAt: r.updated_at } : null;
  }
  async casGameState(roomId: string, expectedVersion: number, state: LiveState) {
    const rows = must(
      await this.sb
        .from("game_states")
        .update({ state, version: expectedVersion + 1 })
        .eq("room_id", roomId)
        .eq("version", expectedVersion)
        .select("room_id"),
    );
    return Array.isArray(rows) && rows.length === 1;
  }

  async insertPlayer(p: Parameters<Store["insertPlayer"]>[0]) {
    return toPlayer(
      must(
        await this.sb
          .from("players")
          .insert({
            id: p.id,
            room_id: p.roomId,
            campaign_id: p.campaignId,
            participant_id: p.participantId,
            nickname: p.nickname,
            avatar: p.avatar,
            color: p.color,
            token_hash: p.tokenHash,
            device_id: p.deviceId,
          })
          .select("*")
          .single(),
      ),
    );
  }
  async getPlayerByToken(roomId: string, tokenHash: string) {
    const r = must(await this.sb.from("players").select("*").eq("room_id", roomId).eq("token_hash", tokenHash).maybeSingle());
    return r ? toPlayer(r) : null;
  }
  async listPlayers(roomId: string) {
    return must(await this.sb.from("players").select("*").eq("room_id", roomId)).map(toPlayer);
  }
  async listCampaignPlayers(campaignId: string) {
    return must(await this.sb.from("players").select("*").eq("campaign_id", campaignId).limit(50000)).map(toPlayer);
  }
  async updatePlayer(id: string, patch: Partial<Pick<PlayerRecord, "lastSeenAt" | "leftAt" | "finalPosition" | "finalRank">>) {
    const row: Row = {};
    if (patch.lastSeenAt !== undefined) row.last_seen_at = patch.lastSeenAt;
    if (patch.leftAt !== undefined) row.left_at = patch.leftAt;
    if (patch.finalPosition !== undefined) row.final_position = patch.finalPosition;
    if (patch.finalRank !== undefined) row.final_rank = patch.finalRank;
    must(await this.sb.from("players").update(row).eq("id", id));
  }

  async addLogs(logs: Omit<GameLog, "id" | "createdAt">[]) {
    if (!logs.length) return;
    must(await this.sb.from("game_logs").insert(logs.map((l) => ({ room_id: l.roomId, player_id: l.playerId, type: l.type, message: l.message, data: l.data }))));
  }
  async listLogs(roomId: string, limit: number): Promise<GameLog[]> {
    return must(await this.sb.from("game_logs").select("*").eq("room_id", roomId).order("id", { ascending: false }).limit(limit)).map((r: Row) => ({
      id: r.id,
      roomId: r.room_id,
      playerId: r.player_id,
      type: r.type,
      message: r.message,
      data: r.data,
      createdAt: r.created_at,
    }));
  }

  async findParticipantByDevice(campaignId: string, deviceId: string) {
    const r = must(
      await this.sb.from("participants").select("*").eq("campaign_id", campaignId).eq("device_id", deviceId).is("anonymized_at", null).limit(1).maybeSingle(),
    );
    return r ? toParticipant(r) : null;
  }
  async insertParticipant(p: Omit<Participant, "id" | "createdAt" | "anonymizedAt">) {
    return toParticipant(
      must(
        await this.sb
          .from("participants")
          .insert({ campaign_id: p.campaignId, device_id: p.deviceId, name: p.name, email: p.email, phone: p.phone, extra: p.extra, marketing_consent: p.marketingConsent })
          .select("*")
          .single(),
      ),
    );
  }
  async updateParticipant(id: string, patch: Partial<Pick<Participant, "name" | "email" | "phone" | "extra" | "marketingConsent">>) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.extra !== undefined) row.extra = patch.extra;
    if (patch.marketingConsent !== undefined) row.marketing_consent = patch.marketingConsent;
    must(await this.sb.from("participants").update(row).eq("id", id));
  }
  async listParticipants(campaignId: string) {
    return must(await this.sb.from("participants").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(50000)).map(toParticipant);
  }
  async addConsent(c: Omit<ConsentRecord, "id" | "createdAt">) {
    must(
      await this.sb.from("marketing_consents").insert({
        participant_id: c.participantId,
        campaign_id: c.campaignId,
        consented: c.consented,
        consent_text: c.consentText,
        user_agent: c.userAgent,
      }),
    );
  }
  async purgeExpired(campaignId: string, retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();
    const rows = must(
      await this.sb
        .from("participants")
        .update({ name: null, email: null, phone: null, extra: {}, device_id: null, anonymized_at: new Date().toISOString() })
        .eq("campaign_id", campaignId)
        .is("anonymized_at", null)
        .lt("created_at", cutoff)
        .select("id"),
    );
    return rows.length;
  }

  async addWinners(w: Omit<Winner, "id" | "createdAt">[]) {
    if (!w.length) return;
    must(
      await this.sb.from("winners").upsert(
        w.map((x) => ({
          campaign_id: x.campaignId,
          room_id: x.roomId,
          room_code: x.roomCode,
          round: x.round,
          player_id: x.playerId,
          participant_id: x.participantId,
          nickname: x.nickname,
          rank: x.rank,
          prize: x.prize,
          coupon_code: x.couponCode,
        })),
        { onConflict: "room_id,round,player_id", ignoreDuplicates: true },
      ),
    );
  }
  async listWinners(campaignId?: string, limit = 500) {
    let q = this.sb.from("winners").select("*").order("created_at", { ascending: false }).limit(limit);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    return must(await q).map(toWinner);
  }
  async getWinner(roomId: string, round: number, playerId: string) {
    const r = must(await this.sb.from("winners").select("*").eq("room_id", roomId).eq("round", round).eq("player_id", playerId).maybeSingle());
    return r ? toWinner(r) : null;
  }
  async addClick(c: Omit<CtaClick, "id" | "createdAt">) {
    must(await this.sb.from("cta_clicks").insert({ campaign_id: c.campaignId, room_id: c.roomId, player_id: c.playerId, cta_id: c.ctaId, url: c.url }));
  }

  async metrics(campaignId?: string): Promise<Metrics> {
    const count = async (table: string, extra?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let q = this.sb.from(table).select("*", { count: "exact", head: true });
      if (campaignId) q = q.eq("campaign_id", campaignId);
      if (extra) q = extra(q);
      const res = await q;
      if (res.error) throw new Error(res.error.message);
      return res.count ?? 0;
    };
    const roomsQ = this.sb.from("rooms").select("games_played").limit(50000);
    const playersQ = this.sb.from("players").select("participant_id, device_id, id").limit(50000);
    const clicksQ = this.sb.from("cta_clicks").select("cta_id").limit(50000);
    const [rooms, players, clicks, winners, consents] = await Promise.all([
      campaignId ? roomsQ.eq("campaign_id", campaignId) : roomsQ,
      campaignId ? playersQ.eq("campaign_id", campaignId) : playersQ,
      campaignId ? clicksQ.eq("campaign_id", campaignId) : clicksQ,
      count("winners"),
      count("participants", (q) => q.eq("marketing_consent", true)),
    ]);
    const roomRows = must(rooms) as Row[];
    const playerRows = must(players) as Row[];
    const clickRows = must(clicks) as Row[];
    const clicksByCta: Record<string, number> = {};
    for (const c of clickRows) clicksByCta[c.cta_id] = (clicksByCta[c.cta_id] ?? 0) + 1;
    return {
      players: playerRows.length,
      uniqueParticipants: new Set(playerRows.map((p) => p.participant_id ?? p.device_id ?? p.id)).size,
      gamesPlayed: roomRows.reduce((s, r) => s + (r.games_played ?? 0), 0),
      winners,
      ctaClicks: clickRows.length,
      consents,
      rooms: roomRows.length,
      clicksByCta,
    };
  }
}
