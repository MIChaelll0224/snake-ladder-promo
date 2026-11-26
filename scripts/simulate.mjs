#!/usr/bin/env node
// End-to-end multiplayer simulation: 10 players join, ready up, the host starts,
// the server draws balls on its timer, and the game runs until a winner.
// Usage:  BASE_URL=http://localhost:3000 ADMIN_PASSWORD=admin node scripts/simulate.mjs
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const PLAYERS = 10;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${msg}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { method, body, token, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-player-token": token } : {}),
      ...(cookie ? { cookie } : {}),
      // distinct fake IPs so the per-IP rate limiter treats players separately
      "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log(`Simulating against ${BASE}\n`);

  // --- admin login + test campaign
  const login = await call("/api/admin/login", { body: { password: ADMIN_PASSWORD } });
  ok(login.status === 200, "admin login");
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const bad = await call("/api/admin/campaigns");
  ok(bad.status === 401, "admin API rejects requests without a session");

  const slug = `sim-${Date.now().toString(36)}`;
  const created = await call("/api/admin/campaigns", {
    cookie,
    body: {
      slug,
      name: "Simulation campaign",
      status: "active",
      gameConfig: { turnSeconds: 5, startCountdownSec: 1, winnersCount: 1, maxPlayers: 10, minPlayers: 2 },
      registration: {
        enabled: true,
        consentEnabled: true,
        fields: [
          { key: "name", label: "Name", type: "text", enabled: true, required: false },
          { key: "email", label: "Email", type: "email", enabled: true, required: true },
        ],
      },
      coupon: { enabled: true, prefix: "SIM", winnerOnly: false, participationCode: "THANKS", prizeByRank: ["Test prize"] },
    },
  });
  ok(created.status === 201, `campaign created (${slug})`);
  const campaign = created.data;

  // --- host creates a room
  const badJoin = await call("/api/rooms", { body: { campaign: slug, nickname: "Host", fields: {} } });
  ok(badJoin.status === 400, "required registration field is enforced server-side");
  const host = await call("/api/rooms", { body: { campaign: slug, nickname: "Host", deviceId: "device-host-0001", fields: { email: "host@example.com" }, consent: true } });
  ok(host.status === 200 && host.data.code, `host created room ${host.data.code}`);
  const code = host.data.code;
  const players = [{ name: "Host", token: host.data.token, id: host.data.playerId }];

  // --- 9 more players join
  const names = ["Juan", "Maria", "Jose", "Ana", "Pedro", "Liza", "Carlo", "Bea", "Migs"];
  for (const [i, n] of names.entries()) {
    const r = await call(`/api/rooms/${code}/join`, {
      body: { nickname: n, deviceId: `device-player-${i}000`, fields: { email: `${n.toLowerCase()}@example.com`, name: n }, consent: i % 2 === 0 },
    });
    ok(r.status === 200, `${n} joined`);
    players.push({ name: n, token: r.data.token, id: r.data.playerId });
  }
  const full = await call(`/api/rooms/${code}/join`, { body: { nickname: "Eleventh", fields: { email: "x@example.com" } } });
  ok(full.status === 409, "11th player is rejected (room full)");

  let view = (await call(`/api/rooms/${code}`, { token: players[1].token })).data;
  ok(view.players.length === 10, "lobby shows 10 players");
  ok(view.me?.playerId === players[1].id, "player sees themselves");
  ok(new Set(view.players.map((p) => p.avatar)).size === 10 && new Set(view.players.map((p) => p.color)).size === 10, "every player got a unique avatar and color");
  ok(!JSON.stringify(view).includes("tokenHash") && !JSON.stringify(view).includes("@example.com"), "state contains no tokens or emails");

  // --- start rules
  let r = await call(`/api/rooms/${code}/action`, { token: players[0].token, body: { type: "start" } });
  ok(r.status === 409, `host cannot start before everyone is ready ("${r.data.error}")`);
  r = await call(`/api/rooms/${code}/action`, { token: players[3].token, body: { type: "start" } });
  ok(r.status === 403, "non-host cannot start");
  r = await call(`/api/rooms/${code}/action`, { token: players[3].token, body: { type: "kick", playerId: players[4].id } });
  ok(r.status === 403, "non-host cannot kick");
  await Promise.all(players.slice(1).map((p) => call(`/api/rooms/${code}/action`, { token: p.token, body: { type: "ready" } })));
  view = (await call(`/api/rooms/${code}`, { token: players[0].token })).data;
  ok(view.players.every((p) => p.ready), "all 10 players ready");
  r = await call(`/api/rooms/${code}/action`, { token: players[0].token, body: { type: "start" } });
  ok(r.status === 200, "host started the game");
  r = await call(`/api/rooms/${code}/action`, { token: players[0].token, body: { type: "start" } });
  view = (await call(`/api/rooms/${code}`)).data;
  ok(view.room.status === "playing", "room is playing (double start ignored)");
  const late = await call(`/api/rooms/${code}/join`, { body: { nickname: "Late", fields: { email: "late@example.com" } } });
  ok(late.status === 409, "cannot join a running game");

  const tokenOf = (id) => players.find((p) => p.id === id).token;
  const get = async () => (await call(`/api/rooms/${code}`)).data;

  // --- turn rules
  view = await get();
  ok(view.board.snakes.length > 0 && view.board.ladders.length > 0, `one shared board (${view.board.snakes.length} snakes, ${view.board.ladders.length} ladders)`);
  ok(!!view.turn && view.players.some((p) => p.id === view.turn), `${view.players.find((p) => p.id === view.turn).nickname} goes first`);
  const notMe = players.find((p) => p.id !== view.turn);
  r = await call(`/api/rooms/${code}/action`, { token: notMe.token, body: { type: "roll", turnNo: view.turnNo } });
  ok(r.status === 409, `rolling out of turn is rejected ("${r.data.error}")`);
  r = await call(`/api/rooms/${code}/action`, { body: { type: "tick" } });
  ok((await get()).rollCount === 0, "tick before the turn timer runs out does nothing");
  r = await call(`/api/rooms/${code}/action`, { token: players[0].token, body: { type: "autoroll" } });
  ok(r.status === 403, "players cannot use the organizer auto-roll");

  await sleep(1300); // start countdown
  view = await get();
  const first = view.turn;
  const order = view.players.map((p) => p.id);
  // the current player taps ROLL 5 times at once - only one roll may count
  await Promise.all(Array.from({ length: 5 }, () => call(`/api/rooms/${code}/action`, { token: tokenOf(first), body: { type: "roll", turnNo: view.turnNo } })));
  let v2 = await get();
  ok(v2.rollCount === 1, "5 simultaneous taps on ROLL = exactly 1 roll");
  ok(v2.lastRoll.playerId === first && !v2.lastRoll.auto, `roll by the right player: ${v2.lastRoll.roll} → square ${v2.lastRoll.move.to}`);
  ok(v2.turn === order[(order.indexOf(first) + 1) % order.length], "turn passed to the next player in order");
  const movedOthers = v2.players.filter((p) => p.id !== first && p.position !== 0).length;
  ok(movedOthers === 0, "only the current player moved");

  // --- turn timer: nobody rolls, the computer rolls for them
  const waitFor = v2.turnEndsAt - v2.serverNow + 100;
  console.log(`  … waiting ${Math.round(waitFor / 1000)}s for the turn timer`);
  await sleep(waitFor);
  await Promise.all(players.map((p) => call(`/api/rooms/${code}/action`, { token: p.token, body: { type: "tick" } })));
  const v3 = await get();
  ok(v3.rollCount === 2 && v3.lastRoll.auto === true && v3.lastRoll.playerId === v2.turn, "time ran out → computer rolled once for the player (10 concurrent ticks)");

  // --- play it out: whoever's turn it is rolls
  let guard = 0;
  let state = v3;
  let consistent = true;
  let turnsOk = true;
  while (state.room.status !== "finished" && guard++ < 3000) {
    const who = state.turn;
    await call(`/api/rooms/${code}/action`, { token: tokenOf(who), body: { type: "roll", turnNo: state.turnNo } });
    const next = await get();
    if (next.rollCount !== state.rollCount + 1 || next.lastRoll.playerId !== who) turnsOk = false;
    const m = next.lastRoll.move;
    const ladder = next.board.ladders.find(([x]) => x === m.landed);
    const snake = next.board.snakes.find(([x]) => x === m.landed);
    const expect = m.landed >= 100 ? 100 : ladder ? ladder[1] : snake ? snake[1] : m.landed;
    if (m.to !== expect || m.from !== state.players.find((p) => p.id === who).position) consistent = false;
    state = next;
  }
  ok(turnsOk, "every roll was made by the player whose turn it was");
  ok(consistent, "every move matches the board's snakes and ladders");
  ok(state.room.status === "finished", `game finished after ${state.rollCount} rolls`);
  const winners = state.winners.map((id) => state.players.find((p) => p.id === id));
  ok(winners.length === 1 && winners[0].position === 100 && winners[0].rank === 1, `winner: ${winners.map((w) => w.nickname).join(", ")}`);

  const wp = players.find((p) => p.id === state.winners[0]);
  const wv = (await call(`/api/rooms/${code}`, { token: wp.token })).data;
  ok(/^SIM-[A-Z0-9]{6}$/.test(wv.me?.couponCode ?? ""), `winner receives a unique coupon (${wv.me?.couponCode})`);
  ok(wv.me?.prize === "Test prize", "winner sees their prize");
  const lp = players.find((p) => !state.winners.includes(p.id));
  const lv = (await call(`/api/rooms/${code}`, { token: lp.token })).data;
  ok(lv.me?.couponCode === "THANKS", "non-winner gets the thank-you code");
  r = await call(`/api/rooms/${code}/action`, { token: lp.token, body: { type: "roll", turnNo: state.turnNo } });
  ok(r.status === 409 && (await get()).rollCount === state.rollCount, "no rolls after the game is over");

  // --- CTA tracking
  const cta = await call(`/api/cta?c=${campaign.id}&id=facebook&r=${code}&p=${players[2].id}`);
  ok(cta.status === 302 || cta.status === 307, `CTA redirects (${cta.headers.get("location")})`);

  // --- admin data
  const csv = await call(`/api/admin/campaigns/${campaign.id}/export`, { cookie });
  const lines = String(csv.data).trim().split(/\r\n/);
  ok(csv.status === 200 && lines.length === 11, `participants CSV has 10 rows (+header)`);
  const wcsv = await call(`/api/admin/campaigns/${campaign.id}/export?kind=winners`, { cookie });
  ok(String(wcsv.data).includes(wv.me.couponCode), "winner recorded in winners CSV");
  const noCsv = await call(`/api/admin/campaigns/${campaign.id}/export`);
  ok(noCsv.status === 401, "CSV export requires admin");

  // --- rematch
  r = await call(`/api/rooms/${code}/action`, { token: players[5].token, body: { type: "rematch" } });
  ok(r.status === 403, "only the host can start a rematch");
  r = await call(`/api/rooms/${code}/action`, { token: players[0].token, body: { type: "rematch" } });
  const re = (await call(`/api/rooms/${code}`)).data;
  ok(re.room.status === "lobby" && re.room.round === 2 && re.players.every((p) => p.position === 0), "rematch resets to lobby, round 2");

  console.log(`\n${failures ? `❌ ${failures} check(s) failed` : "✅ All checks passed"} — room ${code}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
