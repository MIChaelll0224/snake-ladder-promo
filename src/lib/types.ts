// Shared domain types (server + client)

export type Pair = [number, number]; // [from, to]

export interface BoardLayout {
  snakes: Pair[]; // [head, tail]  head > tail
  ladders: Pair[]; // [bottom, top] bottom < top
}

export interface Branding {
  logoUrl: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string; // css color for page bg
  backgroundImageUrl: string;
  bannerImageUrl: string;
  bannerText: string;
  sponsorLogos: { name: string; logoUrl: string; url: string }[];
}

export interface CampaignContent {
  headline: string;
  tagline: string;
  welcomeMessage: string;
  mechanics: string[];
  prizeTitle: string;
  prizeDetails: string;
  winnerMessage: string;
  loserMessage: string;
  privacyNotice: string;
  consentText: string;
}

export interface GameConfig {
  maxPlayers: number; // 2..10
  minPlayers: number; // >=2
  turnSeconds: number; // time a player has to roll before the computer rolls for them
  startCountdownSec: number; // delay before the first turn
  diceMax: number; // 6 = classic die
  /** What happens when a roll goes past 100:
   *  bounce = count back down (98 + 4 → 99, 100, 99, 98), exact = stay put, any = finish anyway */
  finishRule: FinishRule;
  extraTurnOnSix: boolean; // rolling the highest number gives another turn
  winnersCount: number; // how many places end the game (1 = first to 100)
  snakesCount: number;
  laddersCount: number;
  customLayouts: BoardLayout[]; // if not empty, each round uses one of these (else random)
  allowSpectators: boolean;
  allowPlayerHosting: boolean; // players can create rooms from the landing page
}

export type FinishRule = "bounce" | "exact" | "any";

export type FieldType = "text" | "email" | "tel" | "select";
export interface RegistrationField {
  key: string;
  label: string;
  type: FieldType;
  enabled: boolean;
  required: boolean;
  options?: string[];
}
export interface RegistrationConfig {
  enabled: boolean;
  fields: RegistrationField[];
  consentEnabled: boolean;
}

export interface Cta {
  id: string;
  label: string;
  url: string;
  style: "primary" | "secondary" | "outline";
  showOn: ("landing" | "lobby" | "game" | "finish")[];
}

export interface Milestone {
  id: string;
  trigger: "square" | "ladder" | "snake" | "finish";
  value?: number; // square number for trigger=square
  title: string;
  message: string;
  ctaId?: string;
}

export interface CouponConfig {
  enabled: boolean;
  prefix: string;
  winnerOnly: boolean; // false = everyone who finished the game gets a participation code
  participationCode: string; // shared code for non-winners (if winnerOnly=false)
  prizeByRank: string[]; // prize label per rank, index 0 = 1st
}

export type CampaignStatus = "draft" | "active" | "archived";

export interface Campaign {
  id: string;
  slug: string;
  name: string;
  businessName: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  branding: Branding;
  content: CampaignContent;
  gameConfig: GameConfig;
  registration: RegistrationConfig;
  ctas: Cta[];
  milestones: Milestone[];
  coupon: CouponConfig;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export type RoomStatus = "lobby" | "playing" | "paused" | "finished";

export interface Room {
  id: string;
  code: string;
  campaignId: string;
  status: RoomStatus;
  hostedByAdmin: boolean;
  gamesPlayed: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerRecord {
  id: string;
  roomId: string;
  campaignId: string;
  participantId: string | null;
  nickname: string;
  avatar: string;
  color: string;
  tokenHash: string;
  deviceId: string | null;
  lastSeenAt: string;
  joinedAt: string;
  leftAt: string | null;
  finalPosition: number | null;
  finalRank: number | null;
}

// ---- Live game state (one row per room, updated atomically with a version check)

export type MoveKind = "move" | "ladder" | "snake" | "blocked" | "bounce" | "finish" | "none";

export interface MoveResult {
  from: number;
  roll: number;
  landed: number; // square reached by the roll (before ladder/snake)
  to: number; // final square
  kind: MoveKind;
  bounce?: boolean; // went past 100 and counted back down to `landed`
}

export interface LivePlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
  ready: boolean;
  position: number; // 0 = start (off board)
  rank: number | null;
  finishedAtRoll: number | null;
  joinedAt: number;
  left?: boolean; // left during a game (the computer rolls for them, removed on rematch)
}

export interface RollRecord {
  seq: number; // 1, 2, 3 … within the round
  playerId: string;
  roll: number;
  move: MoveResult;
  auto: boolean; // rolled by the computer because time ran out / player left
  at: number;
}

export interface LiveState {
  status: RoomStatus;
  round: number;
  hostPlayerId: string | null;
  order: string[]; // join order = turn order
  players: Record<string, LivePlayer>;
  board: BoardLayout; // ONE shared board for everyone
  turn: string | null; // whose turn it is
  turnNo: number; // increases every turn - clients send it with "roll" to prevent double rolls
  turnEndsAt: number | null; // epoch ms - after this the computer rolls for the player
  rollCount: number;
  lastRoll: RollRecord | null;
  pausedRemainingMs: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  winners: string[]; // player ids, rank order
}

export interface GameStateRow {
  roomId: string;
  version: number;
  state: LiveState;
  updatedAt: string;
}

export interface GameLog {
  id: number;
  roomId: string;
  playerId: string | null;
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface Participant {
  id: string;
  campaignId: string;
  deviceId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  extra: Record<string, string>;
  marketingConsent: boolean;
  createdAt: string;
  anonymizedAt: string | null;
}

export interface ConsentRecord {
  id: string;
  participantId: string;
  campaignId: string;
  consented: boolean;
  consentText: string;
  userAgent: string | null;
  createdAt: string;
}

export interface Winner {
  id: string;
  campaignId: string;
  roomId: string;
  roomCode: string;
  round: number;
  playerId: string;
  participantId: string | null;
  nickname: string;
  rank: number;
  prize: string;
  couponCode: string | null;
  createdAt: string;
}

export interface CtaClick {
  id: string;
  campaignId: string;
  roomId: string | null;
  playerId: string | null;
  ctaId: string;
  url: string;
  createdAt: string;
}

// ---- What the client receives

export interface PublicCampaign {
  id: string;
  slug: string;
  name: string;
  businessName: string;
  branding: Branding;
  content: CampaignContent;
  gameConfig: Omit<GameConfig, "customLayouts">;
  registration: RegistrationConfig;
  ctas: Omit<Cta, "url">[];
  milestones: Milestone[];
  couponEnabled: boolean;
  prizeByRank: string[];
  isOpen: boolean;
  closedReason: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface PlayerView extends LivePlayer {
  online: boolean;
  isHost: boolean;
}

export interface RoomView {
  serverNow: number;
  version: number;
  room: { code: string; status: RoomStatus; hostedByAdmin: boolean; round: number };
  campaign: PublicCampaign;
  hostPlayerId: string | null;
  players: PlayerView[];
  board: BoardLayout;
  turn: string | null;
  turnNo: number;
  turnEndsAt: number | null;
  rollCount: number;
  lastRoll: RollRecord | null;
  startedAt: number | null;
  pausedRemainingMs: number | null;
  winners: string[];
  logs: Pick<GameLog, "id" | "type" | "message" | "createdAt" | "playerId">[];
  me: { playerId: string; couponCode: string | null; prize: string | null } | null;
  viewer: "player" | "spectator" | "admin";
}
