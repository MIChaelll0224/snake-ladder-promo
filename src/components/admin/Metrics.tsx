import type { Metrics } from "@/lib/store/types";

export function MetricGrid({ m }: { m: Metrics }) {
  const items: [string, number, string][] = [
    ["Players (joins)", m.players, "👥"],
    ["Unique participants", m.uniqueParticipants, "🧑"],
    ["Games played", m.gamesPlayed, "🎲"],
    ["Winners", m.winners, "🏆"],
    ["CTA link clicks", m.ctaClicks, "🔗"],
    ["Marketing opt-ins", m.consents, "✉️"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value, icon]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xl">{icon}</div>
          <div className="mt-1 font-display text-3xl font-bold">{value.toLocaleString()}</div>
          <div className="text-xs font-semibold text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}
