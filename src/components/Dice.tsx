"use client";

import { useEffect, useState } from "react";

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

export function DieFace({ value, size = 96, color = "#fff" }: { value: number | null; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={value ? `Dice shows ${value}` : "Dice"}>
      <defs>
        <linearGradient id="dieg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e5e7eb" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="20" fill={color === "#fff" ? "url(#dieg)" : color} stroke="#111827" strokeOpacity=".15" strokeWidth="2" />
      {value == null ? (
        <text x="50" y="66" textAnchor="middle" fontSize="44" fontWeight="800" fill="#9ca3af" fontFamily="var(--font-display)">
          ?
        </text>
      ) : PIPS[value] ? (
        PIPS[value].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={value === 1 ? "#dc2626" : "#111827"} />)
      ) : (
        <text x="50" y="66" textAnchor="middle" fontSize="48" fontWeight="800" fill="#111827" fontFamily="var(--font-display)">
          {value}
        </text>
      )}
    </svg>
  );
}

/** Shows the last roll; while `rolling`, tumbles through random faces. */
export function Dice({ value, rolling, max = 6, size = 96 }: { value: number | null; rolling: boolean; max?: number; size?: number }) {
  const [face, setFace] = useState<number>(value ?? 1);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * max)), 80);
    return () => clearInterval(t);
  }, [rolling, max]);
  return (
    <div key={rolling ? "r" : `v${value}`} className={`drop-shadow-xl ${rolling ? "dice-rolling" : "ball-pop"}`}>
      <DieFace value={rolling ? face : value} size={size} />
    </div>
  );
}
