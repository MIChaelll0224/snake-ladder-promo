import "server-only";
import { randomUUID } from "node:crypto";
import { AVATARS, PLAYER_COLORS, campaignOpenState } from "../defaults";
import { applyRoll, boardFor, emptyState, nextTurn, standings, TURN_GRACE_MS } from "../engine";
import { getStore } from "../store";
import type {
  Campaign,
  GameLog,
  GameStateRow,
  LivePlayer,
  LiveState,
  PlayerRecord,
  PublicCampaign,
  Room,
  RoomView,
} from "../types";
import { broadcastRoom } from "./realtime";
import { hashToken, newCouponCode, newRoomCode, newToken, secureRandomInt } from "./security";

export class GameError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const ONLINE_MS = 30_000;
const HOST_TRANSFER_MS = 45_000;

type LogInput = Omit<GameLog, "id" | "createdAt" | "roomId">;

interface Ctx {
  room: Room;
  campaign: Campaign;
  row: GameStateRow;
}

export async function loadRoom(codeRaw: string): Promise<Ctx> {
  const code = String(codeRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const store = getStore();
  const room = code.length >= 4 ? await store.getRoomByCode(code) : null;
  if (!room) throw new GameError(404, "Room not found. Check the code and try again.");
  const [campaign, row] = await Promise.all([store.getCampaign(room.campaignId), store.getGameState(room.id)]);
  if (!campaign || !row) throw new GameError(404, "Room not found.");
  return { room, campaign, row };
}

/**
 * Applies a change to the live state with optimistic concurrency.
 * `fn` gets a fresh copy each attempt; returning null means "nothing to do".
 */
async function mutate(
  ctx: Ctx,
  fn: (s: LiveState, ctx: Ctx) => { logs?: LogInput[]; after?: (s: LiveState) => Promise<void> } | null,
): Promise<{ changed: boolean; ctx: Ctx }> {
  const store = getStore();
  let cur = ctx;
  for (let attempt = 0; attempt < 8; attempt++) {
    const state = structuredClone(cur.row.state);
    const res = fn(state, cur);
    if (!res) return { changed: false, ctx: cur };
    const ok = await store.casGameState(cur.room.id, cur.row.version, state);
    if (ok) {
      const next: Ctx = { ...cur, row: { ...cur.row, version: cur.row.version + 1, state } };
      if (res.logs?.length) await store.addLogs(res.logs.map((l) => ({ ...l, roomId: cur.room.id })));
      if (cur.room.status !== state.status) {
        await store.updateRoom(cur.room.id, { status: state.status });
        next.room = { ...next.room, status: state.status };
      }
      if (res.after) await res.after(state);
      await broadcastRoom(cur.room.code, next.row.version);
      return { changed: true, ctx: next };
    }
    // lost the race: reload and retry
    const row = await store.getGameState(cur.room.id);
    const room = await store.getRoomByCode(cur.room.code);
    if (!row || !room) throw new GameError(404, "Room not found.");
    cur = { ...cur, row, room };
  }
  throw new GameError(409, "The room is busy, please try again.");
}

// ---------------------------------------------------------------- campaign helpers

export function publicCampaign(c: Campaign): PublicCampaign {
  const open = campaignOpenState(c);
  const { customLayouts: _ignored, ...gameConfig } = c.gameConfig; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    businessName: c.businessName,
    branding: c.branding,
    content: c.content,
    gameConfig,
    registration: c.registration,
    ctas: c.ctas.filter((x) => x.url).map(({ url: _u, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
    milestones: c.milestones,
    couponEnabled: c.coupon.enabled,
    prizeByRank: c.coupon.prizeByRank,
    isOpen: open.open,
    closedReason: open.reason,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
  };
}

export async function getActiveCampaign(): Promise<Campaign | null> {
  const list = await getStore().listCampaigns();
  return list.find((c) => campaignOpenState(c).open) ?? list.find((c) => c.status === "active") ?? list[0] ?? null;
}

// ---------------------------------------------------------------- rooms

export async function createRoom(campaign: Campaign, hostedByAdmin: boolean): Promise<Room> {
  const store = getStore();
  for (let i = 0; i < 6; i++) {
    const code = newRoomCode();
    if (await store.getRoomByCode(code)) continue;
    try {
      const room = await store.createRoom({ code, campaignId: campaign.id, hostedByAdmin }, emptyState());
      await store.addLogs([{ roomId: room.id, playerId: null, type: "room", message: `Room ${code} created`, data: {} }]);
      return room;
    } catch {
      /* code collision - retry */
    }
  }
  throw new GameError(500, "Could not create a room, please try again.");
}

export interface JoinInput {
  nickname: string;
  avatar?: string;
  deviceId?: string;
  fields?: Record<string, string>;
  consent?: boolean;
  userAgent?: string | null;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, max);

export async function joinRoom(code: string, input: JoinInput): Promise<{ playerId: string; token: string; code: string }> {
  const ctx = await loadRoom(code);
  const { campaign } = ctx;
  const store = getStore();

  const open = campaignOpenState(campaign);
  if (!open.open) throw new GameError(403, open.reason ?? "This promo is closed.");
  if (ctx.row.state.status !== "lobby") throw new GameError(409, "This game has already started. You can watch as a spectator or join the next round.");
  if (ctx.row.state.order.length >= campaign.gameConfig.maxPlayers) throw new GameError(409, `This room is full (${campaign.gameConfig.maxPlayers} players max).`);

  let nickname = clean(input.nickname, 16);
  if (nickname.length < 2) throw new GameError(400, "Please enter a nickname (2–16 characters).");
  let avatar = AVATARS.includes(input.avatar ?? "") ? input.avatar! : "";
  const deviceId = input.deviceId && /^[a-zA-Z0-9-]{8,64}$/.test(input.deviceId) ? input.deviceId : null;

  // ---- registration (marketing data). Validated server-side against the campaign config.
  let participantId: string | null = null;
  if (campaign.registration.enabled) {
    const values: Record<string, string> = {};
    for (const f of campaign.registration.fields.filter((x) => x.enabled)) {
      const v = clean(input.fields?.[f.key], f.type === "email" ? 120 : 100);
      if (f.required && !v) throw new GameError(400, `${f.label} is required.`);
      if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new GameError(400, "Please enter a valid email address.");
      if (v && f.type === "tel" && !/^[+0-9 ()-]{7,20}$/.test(v)) throw new GameError(400, "Please enter a valid mobile number.");
      if (v && f.type === "select" && f.options?.length && !f.options.includes(v)) throw new GameError(400, `Please choose a valid ${f.label}.`);
      if (v) values[f.key] = v;
    }
    const consent = campaign.registration.consentEnabled && input.consent === true;
    const { name = null, email = null, phone = null, ...extra } = values;
    const hasData = Object.keys(values).length > 0 || consent;
    const existing = deviceId ? await store.findParticipantByDevice(campaign.id, deviceId) : null;
    if (existing) {
      participantId = existing.id;
      if (hasData) {
        await store.updateParticipant(existing.id, {
          name: name ?? existing.name,
          email: email ?? existing.email,
          phone: phone ?? existing.phone,
          extra: { ...existing.extra, ...extra },
          marketingConsent: consent || existing.marketingConsent,
        });
      }
    } else {
      const p = await store.insertParticipant({ campaignId: campaign.id, deviceId, name, email, phone, extra, marketingConsent: consent });
      participantId = p.id;
    }
    if (campaign.registration.consentEnabled && participantId && input.consent !== undefined) {
      await store.addConsent({
        participantId,
        campaignId: campaign.id,
        consented: consent,
        consentText: campaign.content.consentText,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      });
    }
  }

  const token = newToken();
  const playerId = randomUUID();
  let seatColor = "";

  const { ctx: after } = await mutate(ctx, (s) => {
    if (s.status !== "lobby") throw new GameError(409, "This game has already started.");
    if (s.order.length >= campaign.gameConfig.maxPlayers) throw new GameError(409, "This room is full.");
    const names = new Set(s.order.map((id) => s.players[id].nickname.toLowerCase()));
    let finalName = nickname;
    for (let n = 2; names.has(finalName.toLowerCase()); n++) finalName = `${nickname.slice(0, 13)} ${n}`;
    nickname = finalName;
    const used = new Set(s.order.map((id) => s.players[id].color));
    seatColor = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[s.order.length % PLAYER_COLORS.length];
    if (!avatar) {
      const taken = new Set(s.order.map((id) => s.players[id].avatar));
      const free = AVATARS.filter((a) => !taken.has(a));
      avatar = free.length ? free[secureRandomInt(free.length)] : AVATARS[secureRandomInt(AVATARS.length)];
    }
    const p: LivePlayer = {
      id: playerId,
      nickname,
      avatar,
      color: seatColor,
      ready: false,
      position: 0,
      rank: null,
      finishedAtRoll: null,
      joinedAt: Date.now(),
    };
    s.players[playerId] = p;
    s.order.push(playerId);
    if (!s.hostPlayerId && !ctx.room.hostedByAdmin) {
      s.hostPlayerId = playerId;
      p.ready = true;
    }
    return { logs: [{ playerId: null, type: "join", message: `${avatar} ${nickname} joined the room`, data: { playerId } }] };
  });

  await store.insertPlayer({
    id: playerId,
    roomId: after.room.id,
    campaignId: campaign.id,
    participantId,
    nickname,
    avatar,
    color: seatColor,
    tokenHash: hashToken(token),
    deviceId,
  });
  return { playerId, token, code: after.room.code };
}

// ---------------------------------------------------------------- actions

export type Actor = { kind: "player"; player: PlayerRecord } | { kind: "admin" } | { kind: "anon" };

export async function resolveActor(ctx: Ctx, token: string | null, admin: boolean): Promise<Actor> {
  if (token && /^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    const p = await getStore().getPlayerByToken(ctx.room.id, hashToken(token));
    if (p && ctx.row.state.players[p.id]) return { kind: "player", player: p };
  }
  if (admin) return { kind: "admin" };
  return { kind: "anon" };
}

const isHost = (actor: Actor, s: LiveState) =>
  actor.kind === "admin" || (actor.kind === "player" && s.hostPlayerId === actor.player.id);

function removePlayer(s: LiveState, id: string) {
  delete s.players[id];
  s.order = s.order.filter((x) => x !== id);
  if (s.hostPlayerId === id) {
    s.hostPlayerId = s.order[0] ?? null;
    if (s.hostPlayerId) s.players[s.hostPlayerId].ready = true;
  }
}

function resetForRound(s: LiveState) {
  for (const id of [...s.order]) if (s.players[id]?.left) removePlayer(s, id);
  for (const id of s.order) {
    const p = s.players[id];
    p.position = 0;
    p.rank = null;
    p.finishedAtRoll = null;
    p.ready = id === s.hostPlayerId;
  }
  s.board = { snakes: [], ladders: [] };
  s.turn = null;
  s.turnEndsAt = null;
  s.rollCount = 0;
  s.lastRoll = null;
  s.winners = [];
  s.pausedRemainingMs = null;
  s.startedAt = null;
  s.finishedAt = null;
}

export async function performAction(code: string, actorToken: string | null, admin: boolean, body: Record<string, unknown>) {
  const ctx = await loadRoom(code);
  const actor = await resolveActor(ctx, actorToken, admin);
  const type = String(body.type || "");
  const store = getStore();
  const me = actor.kind === "player" ? actor.player : null;
  const cfg = ctx.campaign.gameConfig;

  switch (type) {
    case "heartbeat": {
      if (me) await store.updatePlayer(me.id, { lastSeenAt: new Date().toISOString() });
      return { ok: true };
    }

    case "ready":
    case "unready": {
      if (!me) throw new GameError(401, "Join the room first.");
      await mutate(ctx, (s) => {
        const p = s.players[me.id];
        if (s.status !== "lobby" || !p) return null;
        const want = type === "ready";
        if (p.ready === want) return null;
        p.ready = want;
        return { logs: [{ playerId: me.id, type, message: `${p.nickname} is ${want ? "ready ✅" : "not ready"}`, data: {} }] };
      });
      return { ok: true };
    }

    case "leave": {
      if (!me) throw new GameError(401, "Not in this room.");
      await mutate(ctx, (s) => {
        const p = s.players[me.id];
        if (!p) return null;
        if (s.status === "lobby") removePlayer(s, me.id);
        else {
          if (p.left) return null;
          p.left = true;
        }
        return { logs: [{ playerId: me.id, type: "leave", message: `${p.nickname} left the room`, data: {} }] };
      });
      await store.updatePlayer(me.id, { leftAt: new Date().toISOString() });
      return { ok: true };
    }

    case "kick": {
      const target = String(body.playerId || "");
      await mutate(ctx, (s) => {
        if (!isHost(actor, s)) throw new GameError(403, "Only the host can remove players.");
        if (s.status !== "lobby") throw new GameError(409, "Players can only be removed in the lobby.");
        const p = s.players[target];
        if (!p || target === s.hostPlayerId) return null;
        removePlayer(s, target);
        return { logs: [{ playerId: null, type: "kick", message: `${p.nickname} was removed by the host`, data: { playerId: target } }] };
      });
      return { ok: true };
    }

    case "start": {
      const open = campaignOpenState(ctx.campaign);
      if (!open.open) throw new GameError(403, open.reason ?? "Promo closed.");
      await mutate(ctx, (s) => {
        if (!isHost(actor, s)) throw new GameError(403, "Only the host can start the game.");
        if (s.status !== "lobby") return null;
        if (s.order.length < cfg.minPlayers) throw new GameError(409, `At least ${cfg.minPlayers} players are needed to start.`);
        const notReady = s.order.filter((id) => !s.players[id].ready);
        if (notReady.length) throw new GameError(409, `Waiting for ${notReady.map((id) => s.players[id].nickname).join(", ")} to be ready.`);
        const now = Date.now();
        s.status = "playing";
        s.startedAt = now;
        s.board = boardFor(cfg, secureRandomInt);
        s.rollCount = 0;
        s.lastRoll = null;
        s.winners = [];
        // random first player, then everyone in join order
        s.turn = s.order[secureRandomInt(s.order.length)];
        s.turnNo = (s.turnNo || 0) + 1;
        s.turnEndsAt = now + cfg.startCountdownSec * 1000 + cfg.turnSeconds * 1000 + TURN_GRACE_MS;
        return {
          logs: [{ playerId: null, type: "start", message: `🎲 Round ${s.round} started with ${s.order.length} players! ${s.players[s.turn].nickname} goes first.`, data: {} }],
          after: async () => {
            await store.updateRoom(ctx.room.id, { gamesPlayed: ctx.room.gamesPlayed + 1 });
          },
        };
      });
      return { ok: true };
    }

    case "roll": {
      if (!me) throw new GameError(401, "Join the room to play.");
      const expectedTurn = Number(body.turnNo);
      await mutate(ctx, (s) => {
        if (s.status !== "playing") throw new GameError(409, s.status === "paused" ? "The game is paused." : "The game is not running.");
        if (s.turn !== me.id) {
          // a duplicate tap after the roll already went through is not an error
          if (Number.isFinite(expectedTurn) && expectedTurn < s.turnNo) return null;
          throw new GameError(409, `It's not your turn — it's ${s.turn ? s.players[s.turn]?.nickname : "nobody"}'s turn.`);
        }
        if (Number.isFinite(expectedTurn) && expectedTurn !== s.turnNo) return null;
        if (s.startedAt && Date.now() < s.startedAt + cfg.startCountdownSec * 1000) throw new GameError(409, "Get ready… the game is about to start!");
        return doRoll(s, ctx, false);
      });
      return { ok: true };
    }

    case "tick": {
      await maybeAutoRoll(ctx, false);
      return { ok: true };
    }

    case "autoroll": {
      if (actor.kind !== "admin") throw new GameError(403, "Only the organizer can roll for a player.");
      await maybeAutoRoll(ctx, true);
      return { ok: true };
    }

    case "pause":
    case "resume": {
      await mutate(ctx, (s) => {
        if (!isHost(actor, s)) throw new GameError(403, "Only the host can pause the game.");
        const now = Date.now();
        if (type === "pause") {
          if (s.status !== "playing") return null;
          s.status = "paused";
          s.pausedRemainingMs = Math.max(3000, (s.turnEndsAt ?? now) - now);
          s.turnEndsAt = null;
          return { logs: [{ playerId: null, type: "pause", message: "⏸️ Game paused by the host", data: {} }] };
        }
        if (s.status !== "paused") return null;
        s.status = "playing";
        s.turnEndsAt = now + (s.pausedRemainingMs ?? cfg.turnSeconds * 1000);
        s.pausedRemainingMs = null;
        return { logs: [{ playerId: null, type: "resume", message: "▶️ Game resumed", data: {} }] };
      });
      return { ok: true };
    }

    case "end": {
      if (actor.kind !== "admin") throw new GameError(403, "Only an admin can end a game.");
      await mutate(ctx, (s) => {
        if (s.status !== "playing" && s.status !== "paused") return null;
        s.status = "finished";
        s.finishedAt = Date.now();
        s.turn = null;
        s.turnEndsAt = null;
        return {
          logs: [{ playerId: null, type: "end", message: "🛑 The game was ended by the organizer", data: {} }],
          after: (st) => recordFinish(ctx, st),
        };
      });
      return { ok: true };
    }

    case "rematch": {
      await mutate(ctx, (s) => {
        if (!isHost(actor, s)) throw new GameError(403, "Only the host can start a rematch.");
        if (s.status !== "finished") return null;
        s.status = "lobby";
        s.round += 1;
        resetForRound(s);
        return { logs: [{ playerId: null, type: "rematch", message: `🔁 Rematch! Round ${s.round} — new board, tap READY!`, data: {} }] };
      });
      return { ok: true };
    }

    default:
      throw new GameError(400, "Unknown action.");
  }
}

type Mutation = { logs?: LogInput[]; after?: (s: LiveState) => Promise<void> };

/** Rolls the dice for the current player (server random) and applies it to `s` in place. */
function doRoll(s: LiveState, ctx: Ctx, auto: boolean): Mutation {
  const cfg = ctx.campaign.gameConfig;
  const pid = s.turn!;
  const roll = 1 + secureRandomInt(cfg.diceMax);
  const out = applyRoll(s, roll, cfg, Date.now(), auto);
  Object.assign(s, out.state);
  const p = s.players[pid];
  const m = out.move;
  const who = `${p.avatar} ${p.nickname}`;
  let message = `🎲 ${who} ${auto ? "(auto) " : ""}rolled ${roll} → ${m.to}`;
  let type = "roll";
  if (m.kind === "ladder") [type, message] = ["ladder", `🪜 ${who} rolled ${roll} and climbed a ladder ${m.landed} → ${m.to}!`];
  else if (m.kind === "snake") [type, message] = ["snake", `🐍 ${who} rolled ${roll} and got bitten! ${m.landed} → ${m.to}`];
  else if (m.kind === "finish") [type, message] = ["finish", `🏆 ${who} rolled ${roll} and reached 100! (#${p.rank})`];
  else if (m.kind === "blocked") message = `✋ ${who} rolled ${roll} — needs exactly ${100 - m.from} to finish`;
  else if (m.kind === "bounce") message = `↩️ ${who} rolled ${roll} — too many! Bounced back from 100 to ${m.to}`;
  if (m.bounce && (m.kind === "ladder" || m.kind === "snake")) message = message.replace(" and ", ", bounced back to " + m.landed + " and ");
  const logs: LogInput[] = [{ playerId: pid, type, message, data: { auto, ...m } }];
  if (out.extraTurn) logs.push({ playerId: pid, type: "extra", message: `⭐ ${p.nickname} rolled a ${roll} — roll again!`, data: {} });
  if (out.gameOver)
    logs.push({ playerId: null, type: "gameover", message: `🎉 Game over! Winner${s.winners.length > 1 ? "s" : ""}: ${s.winners.map((id) => s.players[id].nickname).join(", ")}`, data: {} });
  return { logs, after: out.gameOver ? (st) => recordFinish(ctx, st) : undefined };
}

/**
 * Turn timer. Called lazily by any client poll/tick: once the current player's time is up
 * (or soon after their turn starts if they left / went offline), the computer rolls for them.
 */
async function maybeAutoRoll(ctx: Ctx, force: boolean, offline?: Set<string>): Promise<Ctx> {
  const cfg = ctx.campaign.gameConfig;
  if (!force && !offline) {
    const now = Date.now();
    const records = await getStore().listPlayers(ctx.room.id);
    offline = new Set(records.filter((r) => now - new Date(r.lastSeenAt).getTime() > ONLINE_MS).map((r) => r.id));
  }
  const { ctx: next } = await mutate(ctx, (s) => {
    const now = Date.now();
    if (s.status !== "playing" || !s.turn || s.turnEndsAt == null) return null;
    if (!force) {
      const p = s.players[s.turn];
      const turnStart = s.turnEndsAt - cfg.turnSeconds * 1000 - TURN_GRACE_MS;
      const away = !p || p.left || offline?.has(s.turn);
      const deadline = away ? Math.min(s.turnEndsAt, turnStart + TURN_GRACE_MS + 2500) : s.turnEndsAt;
      if (now < deadline - 250) return null;
    }
    if (!s.players[s.turn]) {
      s.turn = nextTurn(s, s.turn);
      return {};
    }
    return doRoll(s, ctx, true);
  });
  return next;
}

async function recordFinish(ctx: Ctx, s: LiveState) {
  const store = getStore();
  const records = await store.listPlayers(ctx.room.id);
  const byId = new Map(records.map((p) => [p.id, p]));
  const coupon = ctx.campaign.coupon;
  await store.addWinners(
    s.winners.map((id) => {
      const p = s.players[id];
      const rank = p.rank ?? 1;
      return {
        campaignId: ctx.campaign.id,
        roomId: ctx.room.id,
        roomCode: ctx.room.code,
        round: s.round,
        playerId: id,
        participantId: byId.get(id)?.participantId ?? null,
        nickname: p.nickname,
        rank,
        prize: coupon.prizeByRank[rank - 1] ?? coupon.prizeByRank[coupon.prizeByRank.length - 1] ?? "",
        couponCode: coupon.enabled ? newCouponCode(coupon.prefix) : null,
      };
    }),
  );
  const order = standings(s);
  await Promise.all(
    order.map((id, i) => store.updatePlayer(id, { finalPosition: s.players[id].position, finalRank: s.players[id].rank ?? i + 1 })),
  );
}

// ---------------------------------------------------------------- view

export async function getRoomView(code: string, token: string | null, admin: boolean): Promise<RoomView> {
  let ctx = await loadRoom(code);
  const actor = await resolveActor(ctx, token, admin);
  if (actor.kind === "anon" && !ctx.campaign.gameConfig.allowSpectators) throw new GameError(403, "Spectating is disabled for this promo.");

  const store = getStore();

  const records = await store.listPlayers(ctx.room.id);
  const now = Date.now();
  const lastSeen = new Map(records.map((p) => [p.id, new Date(p.lastSeenAt).getTime()]));
  if (actor.kind === "player") {
    lastSeen.set(actor.player.id, now);
    if (now - new Date(actor.player.lastSeenAt).getTime() > 10_000) await store.updatePlayer(actor.player.id, { lastSeenAt: new Date(now).toISOString() });
  }

  // lazy turn timer: whichever request comes first after the deadline makes the computer roll
  const s0 = ctx.row.state;
  if (s0.status === "playing" && s0.turn && s0.turnEndsAt != null) {
    const offline = new Set(s0.order.filter((id) => now - (lastSeen.get(id) ?? 0) > ONLINE_MS));
    ctx = await maybeAutoRoll(ctx, false, offline);
  }

  // hand the host role to someone online if the host vanished in the lobby
  const st = ctx.row.state;
  if (st.status === "lobby" && st.hostPlayerId && now - (lastSeen.get(st.hostPlayerId) ?? 0) > HOST_TRANSFER_MS) {
    const candidate = st.order.find((id) => id !== st.hostPlayerId && now - (lastSeen.get(id) ?? 0) < ONLINE_MS);
    if (candidate) {
      const r = await mutate(ctx, (s) => {
        if (s.hostPlayerId !== st.hostPlayerId || !s.players[candidate]) return null;
        s.hostPlayerId = candidate;
        s.players[candidate].ready = true;
        return { logs: [{ playerId: candidate, type: "host", message: `👑 ${s.players[candidate].nickname} is now the host`, data: {} }] };
      });
      ctx = r.ctx;
    }
  }

  const s = ctx.row.state;
  const logs = await store.listLogs(ctx.room.id, 40);

  let meView: RoomView["me"] = null;
  if (actor.kind === "player") {
    let couponCode: string | null = null;
    let prize: string | null = null;
    if (s.status === "finished") {
      const w = await store.getWinner(ctx.room.id, s.round, actor.player.id);
      if (w) {
        couponCode = w.couponCode;
        prize = w.prize;
      } else if (ctx.campaign.coupon.enabled && !ctx.campaign.coupon.winnerOnly) {
        couponCode = ctx.campaign.coupon.participationCode || null;
      }
    }
    meView = { playerId: actor.player.id, couponCode, prize };
  }

  return {
    serverNow: Date.now(),
    version: ctx.row.version,
    room: { code: ctx.room.code, status: s.status, hostedByAdmin: ctx.room.hostedByAdmin, round: s.round },
    campaign: publicCampaign(ctx.campaign),
    hostPlayerId: s.hostPlayerId,
    players: s.order
      .filter((id) => s.players[id])
      .map((id) => ({
        ...s.players[id],
        online: now - (lastSeen.get(id) ?? 0) < ONLINE_MS && !s.players[id].left,
        isHost: s.hostPlayerId === id,
      })),
    board: s.board,
    turn: s.turn,
    turnNo: s.turnNo,
    turnEndsAt: s.turnEndsAt,
    rollCount: s.rollCount,
    lastRoll: s.lastRoll,
    startedAt: s.startedAt,
    pausedRemainingMs: s.pausedRemainingMs,
    winners: s.winners,
    logs: logs.map((l) => ({ id: l.id, type: l.type, message: l.message, createdAt: l.createdAt, playerId: l.playerId })),
    me: meView,
    viewer: actor.kind === "player" ? "player" : actor.kind === "admin" ? "admin" : "spectator",
  };
}
