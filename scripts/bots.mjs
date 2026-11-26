#!/usr/bin/env node
// Fills a room with bot players so you can test alone. Bots join, tap READY,
// and (unless --no-play) roll the dice whenever it's their turn.
// Usage:  node scripts/bots.mjs ROOMCODE [count=9] [baseUrl] [--no-play]
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const play = !process.argv.includes("--no-play");
const [code, countArg, baseArg] = args;
const BASE = baseArg || process.env.BASE_URL || "http://localhost:3000";
if (!code) {
  console.error("Usage: node scripts/bots.mjs ROOMCODE [count] [baseUrl] [--no-play]");
  process.exit(1);
}
const names = ["Juan", "Maria", "Jose", "Ana", "Pedro", "Liza", "Carlo", "Bea", "Migs"];
const count = Math.min(Number(countArg) || 9, 9);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bots = [];
for (let i = 0; i < count; i++) {
  const headers = { "Content-Type": "application/json", "x-forwarded-for": `10.1.0.${i + 1}` };
  const res = await fetch(`${BASE}/api/rooms/${code}/join`, {
    method: "POST",
    headers,
    body: JSON.stringify({ nickname: names[i], deviceId: `bot-device-${code}-${i}` }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.log(`✘ ${names[i]}: ${data.error}`);
    continue;
  }
  await fetch(`${BASE}/api/rooms/${code}/action`, { method: "POST", headers: { ...headers, "x-player-token": data.token }, body: JSON.stringify({ type: "ready" }) });
  bots.push({ name: names[i], id: data.playerId, headers: { ...headers, "x-player-token": data.token } });
  console.log(`✔ ${names[i]} joined and is ready`);
}
if (!play || !bots.length) process.exit(0);

console.log("Bots are playing — they roll 2–4s after their turn starts. Ctrl+C to stop.");
const done = new Set();
while (true) {
  // every bot polls so it stays "online"
  const views = await Promise.all(bots.map((b) => fetch(`${BASE}/api/rooms/${code}`, { headers: b.headers }).then((r) => r.json()).catch(() => null)));
  const v = views.find(Boolean);
  if (v?.room?.status === "playing" && v.turn) {
    const bot = bots.find((b) => b.id === v.turn);
    const key = `${v.room.round}:${v.turnNo}`;
    if (bot && !done.has(key)) {
      done.add(key);
      // wait out the start countdown, then "think" for 2–4 seconds
      const countdownLeft = v.startedAt ? v.startedAt + v.campaign.gameConfig.startCountdownSec * 1000 - v.serverNow : 0;
      setTimeout(() => {
        fetch(`${BASE}/api/rooms/${code}/action`, { method: "POST", headers: bot.headers, body: JSON.stringify({ type: "roll", turnNo: v.turnNo }) }).catch(() => {});
      }, Math.max(0, countdownLeft) + 2000 + Math.random() * 2000);
    }
  }
  if (v?.room?.status === "lobby" && v.players?.some((p) => bots.some((b) => b.id === p.id) && !p.ready)) {
    // rematch: ready up again
    for (const b of bots) await fetch(`${BASE}/api/rooms/${code}/action`, { method: "POST", headers: b.headers, body: JSON.stringify({ type: "ready" }) });
  }
  await sleep(1000);
}
