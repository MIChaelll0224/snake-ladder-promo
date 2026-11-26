// Pure game engine. No I/O. Used only on the server for authoritative moves
// (board geometry helpers are also used by the client for rendering).
import type { BoardLayout, FinishRule, GameConfig, LiveState, MoveResult, Pair } from "./types";

export type Rng = (maxExclusive: number) => number; // integer in [0, max)

export const BOARD_SIZE = 100;

/** Row/column (0-based, row 0 = bottom) of a square 1..100 on a boustrophedon board. */
export function cellRC(square: number): { row: number; col: number } {
  const i = Math.max(1, Math.min(100, square)) - 1;
  const row = Math.floor(i / 10);
  const inRow = i % 10;
  const col = row % 2 === 0 ? inRow : 9 - inRow;
  return { row, col };
}

/** Center of a square in a 0..100 coordinate space (y grows downward). Square 0 = just left of 1. */
export function cellCenter(square: number): { x: number; y: number } {
  if (square <= 0) return { x: -4, y: 95 };
  const { row, col } = cellRC(square);
  return { x: col * 10 + 5, y: (9 - row) * 10 + 5 };
}

export function emptyState(): LiveState {
  return {
    status: "lobby",
    round: 1,
    hostPlayerId: null,
    order: [],
    players: {},
    board: { snakes: [], ladders: [] },
    turn: null,
    turnNo: 0,
    turnEndsAt: null,
    rollCount: 0,
    lastRoll: null,
    pausedRemainingMs: null,
    startedAt: null,
    finishedAt: null,
    winners: [],
  };
}

/** Extra time on top of the turn timer so the previous move can finish animating. */
export const TURN_GRACE_MS = 2500;

// ---------------------------------------------------------------- board generation

/**
 * Builds a random but fair-ish board: snakes and ladders spread over the board,
 * never chained (no shortcut starts where another ends), nothing on 1 or 100.
 */
export function generateBoard(snakesCount: number, laddersCount: number, rng: Rng): BoardLayout {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set<number>([1, 100]);
    const snakes: Pair[] = [];
    const ladders: Pair[] = [];
    const rowOf = (s: number) => Math.floor((s - 1) / 10);
    let ok = true;

    const pick = (lo: number, hi: number) => lo + rng(hi - lo + 1);

    for (let i = 0; i < laddersCount && ok; i++) {
      let placed = false;
      for (let t = 0; t < 80 && !placed; t++) {
        // spread ladder bottoms over the board
        const band = Math.floor((i / Math.max(1, laddersCount)) * 80);
        const bottom = pick(Math.max(2, band + 2), Math.min(85, band + 18));
        const len = pick(9, 32);
        const top = Math.min(98, bottom + len);
        const rows = rowOf(top) - rowOf(bottom);
        // keep ladders fairly upright so boards stay readable
        if (rows < 1 || rows > 3 || Math.abs(cellRC(top).col - cellRC(bottom).col) > 3 || used.has(bottom) || used.has(top)) continue;
        used.add(bottom).add(top);
        ladders.push([bottom, top]);
        placed = true;
      }
      if (!placed) ok = false;
    }

    for (let i = 0; i < snakesCount && ok; i++) {
      let placed = false;
      for (let t = 0; t < 80 && !placed; t++) {
        const band = Math.floor((i / Math.max(1, snakesCount)) * 75);
        const head = pick(Math.max(16, band + 16), Math.min(99, band + 34));
        const len = pick(8, 38);
        const tail = Math.max(2, head - len);
        const rows = rowOf(head) - rowOf(tail);
        if (rows < 1 || rows > 4 || Math.abs(cellRC(head).col - cellRC(tail).col) > 4 || used.has(head) || used.has(tail)) continue;
        used.add(head).add(tail);
        snakes.push([head, tail]);
        placed = true;
      }
      if (!placed) ok = false;
    }

    if (ok) {
      return { snakes: snakes.sort((a, b) => b[0] - a[0]), ladders: ladders.sort((a, b) => a[0] - b[0]) };
    }
  }
  return { snakes: [[97, 78], [62, 19], [48, 26]], ladders: [[4, 25], [21, 42], [50, 69], [71, 91]] };
}

/** The shared board for a round: one of the admin's custom layouts, or a random one. */
export function boardFor(config: GameConfig, rng: Rng): BoardLayout {
  if (config.customLayouts.length) {
    const l = config.customLayouts[rng(config.customLayouts.length)];
    return { snakes: l.snakes.map((p) => [p[0], p[1]] as Pair), ladders: l.ladders.map((p) => [p[0], p[1]] as Pair) };
  }
  return generateBoard(config.snakesCount, config.laddersCount, rng);
}

// ---------------------------------------------------------------- movement

export function movePlayer(position: number, roll: number, board: BoardLayout, rule: FinishRule = "bounce"): MoveResult {
  const from = position;
  let landed = from + roll;
  let bounce = false;
  if (landed > BOARD_SIZE) {
    if (rule === "exact") return { from, roll, landed: from, to: from, kind: "blocked" };
    if (rule === "bounce") {
      // count up to 100, then back down: 98 + 4 → 99, 100, 99, 98
      landed = BOARD_SIZE - (landed - BOARD_SIZE);
      bounce = true;
    } else landed = BOARD_SIZE;
  }
  const extra = bounce ? { bounce } : {};
  if (landed === BOARD_SIZE) return { from, roll, landed, to: BOARD_SIZE, kind: "finish" };
  const ladder = board.ladders.find(([a]) => a === landed);
  if (ladder) return { from, roll, landed, to: ladder[1], kind: "ladder", ...extra };
  const snake = board.snakes.find(([a]) => a === landed);
  if (snake) return { from, roll, landed, to: snake[1], kind: "snake", ...extra };
  return { from, roll, landed, to: landed, kind: bounce ? "bounce" : "move", ...extra };
}

/** Squares the pawn visits step by step for a move (before any ladder/snake slide). */
export function stepPath(m: Pick<MoveResult, "from" | "landed" | "bounce" | "kind">): number[] {
  if (m.kind === "blocked") return [];
  const steps: number[] = [];
  if (m.bounce) {
    for (let s = m.from + 1; s <= BOARD_SIZE; s++) steps.push(s);
    for (let s = BOARD_SIZE - 1; s >= m.landed; s--) steps.push(s);
  } else for (let s = m.from + 1; s <= m.landed; s++) steps.push(s);
  return steps;
}

/** Next player (in turn order) who is still racing, after `fromId`. */
export function nextTurn(state: LiveState, fromId: string | null): string | null {
  const active = state.order.filter((id) => state.players[id] && state.players[id].rank == null);
  if (!active.length) return null;
  if (!fromId) return active[0];
  const idx = state.order.indexOf(fromId);
  for (let i = 1; i <= state.order.length; i++) {
    const id = state.order[(idx + i) % state.order.length];
    if (state.players[id] && state.players[id].rank == null) return id;
  }
  return null;
}

export interface RollOutcome {
  state: LiveState;
  move: MoveResult;
  finishedPlayer: boolean;
  gameOver: boolean;
  extraTurn: boolean;
}

/** The current player rolls `roll`. Moves them on the shared board and passes the turn. Returns a NEW state. */
export function applyRoll(prev: LiveState, roll: number, config: GameConfig, now: number, auto: boolean): RollOutcome {
  const state: LiveState = structuredClone(prev);
  const pid = state.turn;
  if (!pid || !state.players[pid]) throw new Error("no current player");
  const p = state.players[pid];
  const move = movePlayer(p.position, roll, state.board, config.finishRule);
  p.position = move.to;
  state.rollCount += 1;
  state.lastRoll = { seq: state.rollCount, playerId: pid, roll, move, auto, at: now };

  let finishedPlayer = false;
  if (move.kind === "finish") {
    p.rank = state.winners.length + 1;
    p.finishedAtRoll = state.rollCount;
    state.winners.push(pid);
    finishedPlayer = true;
  }

  const activeLeft = state.order.filter((id) => state.players[id] && state.players[id].rank == null).length;
  // game ends when the prize places are filled, or nobody (or only one player in a multiplayer game) is left racing
  const gameOver = state.winners.length >= config.winnersCount || activeLeft === 0 || (activeLeft === 1 && state.order.length > 1);
  const extraTurn = !gameOver && !finishedPlayer && config.extraTurnOnSix && roll === config.diceMax;

  if (gameOver) {
    state.status = "finished";
    state.finishedAt = now;
    state.turn = null;
    state.turnEndsAt = null;
  } else {
    state.turn = extraTurn ? pid : nextTurn(state, pid);
    state.turnNo += 1;
    state.turnEndsAt = now + config.turnSeconds * 1000 + TURN_GRACE_MS;
  }
  return { state, move, finishedPlayer, gameOver, extraTurn };
}

/** Final standings: finished players by rank, then by position (desc). */
export function standings(state: LiveState): string[] {
  return [...state.order]
    .filter((id) => state.players[id])
    .sort((a, b) => {
      const pa = state.players[a];
      const pb = state.players[b];
      const ra = pa.rank ?? 999;
      const rb = pb.rank ?? 999;
      if (ra !== rb) return ra - rb;
      return pb.position - pa.position;
    });
}
