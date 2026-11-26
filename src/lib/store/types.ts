import type {
  Campaign,
  ConsentRecord,
  CtaClick,
  GameLog,
  GameStateRow,
  LiveState,
  Participant,
  PlayerRecord,
  Room,
  Winner,
} from "../types";

export interface Metrics {
  players: number; // seats taken (joins)
  uniqueParticipants: number;
  gamesPlayed: number;
  winners: number;
  ctaClicks: number;
  consents: number;
  rooms: number;
  clicksByCta: Record<string, number>;
}

/** Storage abstraction: Supabase in production, in-memory for local dev / tests. */
export interface Store {
  readonly kind: "supabase" | "memory";

  // campaigns
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  getCampaignBySlug(slug: string): Promise<Campaign | null>;
  insertCampaign(c: Omit<Campaign, "id" | "createdAt" | "updatedAt">): Promise<Campaign>;
  updateCampaign(id: string, c: Omit<Campaign, "id" | "createdAt" | "updatedAt">): Promise<Campaign>;
  deleteCampaign(id: string): Promise<void>;

  // rooms + state
  createRoom(r: { code: string; campaignId: string; hostedByAdmin: boolean }, state: LiveState): Promise<Room>;
  getRoomByCode(code: string): Promise<Room | null>;
  listRooms(campaignId?: string, limit?: number): Promise<Room[]>;
  updateRoom(id: string, patch: Partial<Pick<Room, "status" | "gamesPlayed">>): Promise<void>;
  getGameState(roomId: string): Promise<GameStateRow | null>;
  /** Compare-and-swap. Returns false if someone else changed the state first. */
  casGameState(roomId: string, expectedVersion: number, state: LiveState): Promise<boolean>;

  // players
  insertPlayer(p: Omit<PlayerRecord, "id" | "joinedAt" | "lastSeenAt" | "leftAt" | "finalPosition" | "finalRank"> & { id: string }): Promise<PlayerRecord>;
  getPlayerByToken(roomId: string, tokenHash: string): Promise<PlayerRecord | null>;
  listPlayers(roomId: string): Promise<PlayerRecord[]>;
  listCampaignPlayers(campaignId: string): Promise<PlayerRecord[]>;
  updatePlayer(id: string, patch: Partial<Pick<PlayerRecord, "lastSeenAt" | "leftAt" | "finalPosition" | "finalRank">>): Promise<void>;

  // logs
  addLogs(logs: Omit<GameLog, "id" | "createdAt">[]): Promise<void>;
  listLogs(roomId: string, limit: number): Promise<GameLog[]>;

  // participants / consent
  findParticipantByDevice(campaignId: string, deviceId: string): Promise<Participant | null>;
  insertParticipant(p: Omit<Participant, "id" | "createdAt" | "anonymizedAt">): Promise<Participant>;
  updateParticipant(id: string, patch: Partial<Pick<Participant, "name" | "email" | "phone" | "extra" | "marketingConsent">>): Promise<void>;
  listParticipants(campaignId: string): Promise<Participant[]>;
  addConsent(c: Omit<ConsentRecord, "id" | "createdAt">): Promise<void>;
  purgeExpired(campaignId: string, retentionDays: number): Promise<number>;

  // winners / clicks
  addWinners(w: Omit<Winner, "id" | "createdAt">[]): Promise<void>;
  listWinners(campaignId?: string, limit?: number): Promise<Winner[]>;
  getWinner(roomId: string, round: number, playerId: string): Promise<Winner | null>;
  addClick(c: Omit<CtaClick, "id" | "createdAt">): Promise<void>;

  metrics(campaignId?: string): Promise<Metrics>;
}
