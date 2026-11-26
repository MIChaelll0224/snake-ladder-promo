import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRoll, cellRC, emptyState, generateBoard, movePlayer } from "../src/lib/engine";
import { DEFAULT_GAME_CONFIG, normalizeCampaign } from "../src/lib/defaults";
import type { BoardLayout, LiveState } from "../src/lib/types";

const rng = (max: number) => Math.floor(Math.random() * max);
const board: BoardLayout = { snakes: [[97, 78], [40, 3]], ladders: [[4, 25], [50, 91]] };

test("boustrophedon numbering", () => {
  assert.deepEqual(cellRC(1), { row: 0, col: 0 });
  assert.deepEqual(cellRC(10), { row: 0, col: 9 });
  assert.deepEqual(cellRC(11), { row: 1, col: 9 });
  assert.deepEqual(cellRC(20), { row: 1, col: 0 });
  assert.deepEqual(cellRC(100), { row: 9, col: 0 });
});

test("ladders, snakes, finish and exact finish", () => {
  assert.equal(movePlayer(0, 4, board, false).to, 25);
  assert.equal(movePlayer(0, 4, board, false).kind, "ladder");
  assert.equal(movePlayer(36, 4, board, false).to, 3);
  assert.equal(movePlayer(36, 4, board, false).kind, "snake");
  assert.equal(movePlayer(10, 3, board, false).to, 13);
  assert.equal(movePlayer(98, 5, board, false).kind, "finish");
  const blocked = movePlayer(98, 5, board, true);
  assert.equal(blocked.kind, "blocked");
  assert.equal(blocked.to, 98);
  assert.equal(movePlayer(98, 2, board, true).kind, "finish");
});

test("generated boards are valid and never chained", () => {
  for (let i = 0; i < 300; i++) {
    const b = generateBoard(8, 8, rng);
    assert.equal(b.snakes.length, 8);
    assert.equal(b.ladders.length, 8);
    const all = [...b.snakes, ...b.ladders].flat();
    assert.equal(new Set(all).size, all.length, "endpoints must be unique");
    for (const [h, t] of b.snakes) assert.ok(h > t && h < 100 && t > 1);
    for (const [a, z] of b.ladders) assert.ok(a < z && z < 100 && a > 1);
  }
});

function stateWith(n: number): LiveState {
  const s = emptyState();
  s.status = "playing";
  s.board = generateBoard(8, 8, rng);
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    s.order.push(id);
    s.players[id] = { id, nickname: id, avatar: "🦁", color: "#000", ready: true, position: 0, rank: null, finishedAtRoll: null, joinedAt: 0 };
  }
  s.turn = s.order[0];
  return s;
}

test("turns rotate and only the current player moves", () => {
  let s = stateWith(3);
  s.board = { snakes: [], ladders: [] };
  s = applyRoll(s, 4, DEFAULT_GAME_CONFIG, 0, false).state;
  assert.equal(s.players.p0.position, 4);
  assert.equal(s.players.p1.position, 0);
  assert.equal(s.turn, "p1");
  s = applyRoll(s, 2, DEFAULT_GAME_CONFIG, 0, false).state;
  assert.equal(s.players.p1.position, 2);
  assert.equal(s.turn, "p2");
  s = applyRoll(s, 6, DEFAULT_GAME_CONFIG, 0, true).state;
  assert.equal(s.turn, "p0", "wraps around to the first player");
  assert.equal(s.lastRoll?.auto, true);
  assert.equal(s.rollCount, 3);
});

test("extra turn on six when enabled", () => {
  let s = stateWith(2);
  s.board = { snakes: [], ladders: [] };
  s = applyRoll(s, 6, { ...DEFAULT_GAME_CONFIG, extraTurnOnSix: true }, 0, false).state;
  assert.equal(s.turn, "p0");
  s = applyRoll(s, 6, DEFAULT_GAME_CONFIG, 0, false).state;
  assert.equal(s.turn, "p1");
});

test("finished players are skipped and a 10 player game always ends", () => {
  for (let g = 0; g < 50; g++) {
    let s = stateWith(10);
    let rolls = 0;
    while (s.status === "playing" && rolls < 5000) {
      s = applyRoll(s, 1 + rng(6), DEFAULT_GAME_CONFIG, Date.now(), false).state;
      rolls++;
    }
    assert.equal(s.status, "finished");
    assert.equal(s.winners.length, 1);
    assert.equal(s.players[s.winners[0]].position, 100);
    assert.equal(s.turn, null);
  }
});

test("winnersCount keeps the game going for podium places", () => {
  const cfg = { ...DEFAULT_GAME_CONFIG, winnersCount: 3 };
  let s = stateWith(5);
  while (s.status === "playing") {
    const before = s.turn!;
    s = applyRoll(s, 1 + rng(6), cfg, Date.now(), false).state;
    if (s.status === "playing") assert.notEqual(s.players[s.turn!].rank, 1, "a finished player never gets a turn");
    void before;
  }
  assert.equal(s.winners.length, 3);
  assert.deepEqual(s.winners.map((id) => s.players[id].rank), [1, 2, 3]);
});

test("campaign config is clamped and sanitised", () => {
  const c = normalizeCampaign({
    slug: "My Promo!!",
    gameConfig: { maxPlayers: 99, turnSeconds: 0, winnersCount: 50 } as never,
    branding: { primary: "javascript:alert(1)", logoUrl: "javascript:alert(1)" } as never,
    ctas: [{ id: "x", label: "Go", url: "javascript:alert(1)", style: "primary", showOn: ["landing"] }],
  });
  assert.equal(c.slug, "my-promo");
  assert.equal(c.gameConfig.maxPlayers, 10);
  assert.equal(c.gameConfig.turnSeconds, 5);
  assert.equal(c.gameConfig.winnersCount, 10);
  assert.equal(c.branding.primary, "#7c3aed");
  assert.equal(c.branding.logoUrl, "");
  assert.equal(c.ctas[0].url, "");
});
