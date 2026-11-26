"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cellCenter, stepPath } from "@/lib/engine";
import type { BoardLayout, MoveResult } from "@/lib/types";
import { sfx } from "@/lib/client/sound";

const ROW_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fed7aa", "#a7f3d0", "#c7d2fe", "#fecaca", "#e9d5ff"];
const SNAKE_COLORS = ["#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#2563eb"];

function lighten(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

/** Cells as an inline SVG so the board stays crisp at any size and cheap to render 10x. */
function Cells({ compact }: { compact: boolean }) {
  const cells = [];
  for (let s = 1; s <= 100; s++) {
    const { x, y } = cellCenter(s);
    const row = Math.floor((s - 1) / 10);
    const base = ROW_COLORS[row];
    const fill = s === 100 ? "#facc15" : s % 2 === 0 ? base : lighten(base, 18);
    cells.push(
      <g key={s}>
        <rect x={x - 5} y={y - 5} width={10} height={10} fill={fill} />
        {!compact && (
          <text x={x - 4.1} y={y - 2.1} fontSize={2.6} fontWeight={700} fill="#374151" opacity={0.75} fontFamily="var(--font-display)">
            {s}
          </text>
        )}
      </g>,
    );
  }
  return (
    <>
      {cells}
      <text x={5} y={97.6} fontSize={compact ? 4.5 : 2.4} textAnchor="middle" fontWeight={800} fill="#15803d" fontFamily="var(--font-display)">
        {compact ? "▶" : "START"}
      </text>
      <text x={5} y={7.2} fontSize={compact ? 6 : 5} textAnchor="middle">
        🏆
      </text>
    </>
  );
}

function Ladder({ from, to, compact }: { from: number; to: number; compact: boolean }) {
  const a = cellCenter(from);
  const b = cellCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const w = compact ? 2.1 : 1.8;
  const rungs = [];
  const n = Math.max(2, Math.floor(len / 3.2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    rungs.push(<line key={i} x1={cx + nx * w} y1={cy + ny * w} x2={cx - nx * w} y2={cy - ny * w} stroke="#f5c27a" strokeWidth={compact ? 0.9 : 0.75} strokeLinecap="round" />);
  }
  const rail = (s: number) => (
    <line x1={a.x + nx * w * s} y1={a.y + ny * w * s} x2={b.x + nx * w * s} y2={b.y + ny * w * s} stroke="#92400e" strokeWidth={compact ? 1.1 : 0.9} strokeLinecap="round" />
  );
  return (
    <g filter="url(#shadow)">
      {rungs}
      {rail(1)}
      {rail(-1)}
    </g>
  );
}

function Snake({ head, tail, color, compact }: { head: number; tail: number; color: string; compact: boolean }) {
  const a = cellCenter(head);
  const b = cellCenter(tail);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const waves = Math.max(1, Math.round(len / 14));
  const amp = compact ? 2.6 : 2.2;
  const pts: string[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = Math.sin(t * Math.PI * 2 * waves) * amp * Math.sin(Math.PI * Math.min(1, t * 1.15));
    pts.push(`${(a.x + dx * t + nx * off).toFixed(2)},${(a.y + dy * t + ny * off).toFixed(2)}`);
  }
  const d = `M${pts.join(" L")}`;
  const body = compact ? 2.6 : 2.3;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <g filter="url(#shadow)">
      <path d={d} fill="none" stroke="#111827" strokeOpacity={0.35} strokeWidth={body + 0.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={body} strokeLinecap="round" strokeLinejoin="round" />
      {!compact && <path d={d} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={0.6} strokeDasharray="0.8 2.2" strokeLinecap="round" />}
      <g transform={`translate(${a.x} ${a.y}) rotate(${ang})`}>
        <ellipse cx={0} cy={0} rx={compact ? 2.4 : 2.2} ry={compact ? 2 : 1.8} fill={color} stroke="#111827" strokeOpacity={0.35} strokeWidth={0.4} />
        {!compact && (
          <>
            <circle cx={-0.6} cy={-0.8} r={0.55} fill="#fff" />
            <circle cx={-0.6} cy={0.8} r={0.55} fill="#fff" />
            <circle cx={-0.75} cy={-0.8} r={0.28} fill="#111" />
            <circle cx={-0.75} cy={0.8} r={0.28} fill="#111" />
            <path d="M-2.1,0 L-3.3,0 M-3.3,0 L-3.8,-0.4 M-3.3,0 L-3.8,0.4" stroke="#ef4444" strokeWidth={0.3} strokeLinecap="round" />
          </>
        )}
      </g>
    </g>
  );
}

export interface PawnSpec {
  id: string;
  color: string;
  avatar: string;
  position: number;
}

function AnimatedPawn({
  pawn,
  move,
  animKey,
  sound,
  compact,
  offset,
  active,
  size,
}: {
  pawn: PawnSpec;
  move?: MoveResult;
  animKey: number;
  sound: boolean;
  compact: boolean;
  offset: { dx: number; dy: number };
  active: boolean;
  size: number;
}) {
  const [pos, setPos] = useState(pawn.position);
  const [slide, setSlide] = useState(false);
  const [hop, setHop] = useState(0);
  const lastKey = useRef(animKey);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animating = useRef(false);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    if (animKey !== lastKey.current) {
      lastKey.current = animKey;
      if (move) {
        clear();
        animating.current = true;
        setSlide(false);
        setPos(move.from);
        const stepMs = 210;
      const steps = stepPath(move);
      steps.forEach((s, i) =>
        timers.current.push(
          setTimeout(() => {
            setPos(s);
            setHop((h) => h + 1);
            if (sound) sfx.step();
          }, (i + 1) * stepMs),
        ),
      );
        const afterSteps = (steps.length + 1) * stepMs;
        let end = afterSteps;
        if (move.to !== move.landed) {
          timers.current.push(
            setTimeout(() => {
              setSlide(true);
              setPos(move.to);
              if (sound) (move.kind === "ladder" ? sfx.ladder : sfx.snake)();
            }, afterSteps + 200),
          );
          end = afterSteps + 1100;
        }
        timers.current.push(
          setTimeout(() => {
            setSlide(false);
            setPos(move.to);
            animating.current = false;
          }, end),
        );
        return;
      }
    }
    // no animation info (first load, rematch, finished players...) - snap to the server position
    if (!animating.current) {
      setSlide(false);
      setPos(pawn.position);
    }
  }, [animKey, move, pawn.position, sound]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const c = cellCenter(Math.max(1, pos));
  const moving = animating.current || slide;
  const dx = moving ? 0 : offset.dx;
  const dy = moving ? 0 : offset.dy;
  return (
    <div
      className={`pawn absolute ${slide ? "slide" : ""}`}
      style={{ left: `${c.x + dx}%`, top: `${c.y + dy}%`, width: `${size}%`, height: `${size}%`, transform: "translate(-50%,-50%)", zIndex: moving ? 30 : active ? 20 : 10 }}
    >
      <div
        key={hop}
        className={`pawn-hop grid h-full w-full place-items-center rounded-full border-2 border-white ${active ? "active-pawn" : ""}`}
        style={{
          background: `radial-gradient(circle at 35% 30%, ${lighten(pawn.color, 70)}, ${pawn.color})`,
          boxShadow: `0 3px 8px rgb(0 0 0 / .45), 0 0 0 2px ${pawn.color}55`,
          transform: "translate(-50%,-50%)",
          position: "absolute",
          left: "50%",
          top: "50%",
          opacity: pos === 0 ? 0.9 : 1,
        }}
      >
        <span style={{ fontSize: `${size * 0.55}cqw`, lineHeight: 1 }}>{pawn.avatar}</span>
      </div>
    </div>
  );
}

interface BoardProps {
  layout: BoardLayout;
  pawns: PawnSpec[];
  moves?: Record<string, MoveResult>;
  animKey: number;
  compact?: boolean;
  sound?: boolean;
  className?: string;
  activeId?: string | null;
}

/** Pawns sharing a square are spread around its center so all stay visible. */
function slotOffsets(n: number): { dx: number; dy: number }[] {
  if (n <= 1) return [{ dx: 0, dy: 0 }];
  const r = n <= 4 ? 2.2 : 2.8;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
  });
}

function BoardImpl({ layout, pawns, moves, animKey, compact = false, sound = false, className = "", activeId = null }: BoardProps) {
  const groups = new Map<number, string[]>();
  for (const p of pawns) groups.set(Math.max(1, p.position), [...(groups.get(Math.max(1, p.position)) ?? []), p.id]);
  const offsetOf = (p: PawnSpec) => {
    const g = groups.get(Math.max(1, p.position)) ?? [p.id];
    return slotOffsets(g.length)[g.indexOf(p.id)];
  };
  const crowded = Math.max(...[...groups.values()].map((g) => g.length), 1);
  const pawnSize = compact ? 12 : pawns.length > 1 ? (crowded > 4 ? 5.2 : 6.6) : 8.2;
  const snakes = useMemo(
    () => layout.snakes.map(([h, t], i) => <Snake key={`s${h}`} head={h} tail={t} color={SNAKE_COLORS[i % SNAKE_COLORS.length]} compact={compact} />),
    [layout.snakes, compact],
  );
  const ladders = useMemo(() => layout.ladders.map(([a, b]) => <Ladder key={`l${a}`} from={a} to={b} compact={compact} />), [layout.ladders, compact]);
  return (
    <div className={`relative aspect-square w-full select-none overflow-hidden ${compact ? "rounded-lg" : "rounded-2xl"} bg-white shadow-xl ${className}`} style={{ containerType: "inline-size" }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0.4" dy="0.6" stdDeviation="0.4" floodOpacity="0.35" />
          </filter>
        </defs>
        <Cells compact={compact} />
        {ladders}
        {snakes}
      </svg>
      {pawns.map((p) => (
        <AnimatedPawn key={p.id} pawn={p} move={moves?.[p.id]} animKey={animKey} sound={sound} compact={compact} offset={offsetOf(p)} active={p.id === activeId} size={pawnSize} />
      ))}
    </div>
  );
}

export const Board = memo(BoardImpl);
