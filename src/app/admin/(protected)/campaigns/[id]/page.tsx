import Link from "next/link";
import { notFound } from "next/navigation";
import { campaignOpenState } from "@/lib/defaults";
import { getStore } from "@/lib/store";
import { MetricGrid } from "@/components/admin/Metrics";
import { CreateRoomButton, DeleteCampaignButton, PurgeButton } from "@/components/admin/AdminActions";

const fmt = (d: string) => new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

export default async function CampaignAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const c = await store.getCampaign(id);
  if (!c) notFound();
  const [m, rooms, winners] = await Promise.all([store.metrics(id), store.listRooms(id, 50), store.listWinners(id, 100)]);
  const states = await Promise.all(rooms.map((r) => store.getGameState(r.id)));
  const open = campaignOpenState(c);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/admin" className="text-sm text-slate-500 hover:underline">
            ← All campaigns
          </Link>
          <h1 className="font-display text-3xl font-bold">{c.name}</h1>
          <p className="text-slate-500">
            {open.open ? "🟢 Live now" : `⚪ ${open.reason}`} ·{" "}
            <a href={`/c/${c.slug}`} target="_blank" className="text-violet-700 underline">
              /c/{c.slug}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/campaigns/${c.id}/edit`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            ⚙️ Edit settings
          </Link>
          <Link href={`/admin/campaigns/${c.id}/participants`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            👥 Participants
          </Link>
          <CreateRoomButton campaignId={c.id} />
        </div>
      </div>

      <MetricGrid m={m} />

      {Object.keys(m.clicksByCta).length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-xl font-bold">CTA clicks</h2>
          <div className="mt-3 space-y-2">
            {Object.entries(m.clicksByCta)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => {
                const max = Math.max(...Object.values(m.clicksByCta));
                return (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <span className="w-48 truncate font-semibold">{c.ctas.find((x) => x.id === k)?.label ?? k}</span>
                    <div className="h-3 flex-1 rounded-full bg-slate-100">
                      <div className="h-3 rounded-full bg-violet-500" style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right font-bold">{v}</span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Rooms & game history</h2>
          <span className="text-sm text-slate-500">Event rooms are hosted from the organizer screen (great on a projector).</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Code</th>
                <th>Created</th>
                <th>Status</th>
                <th>Host</th>
                <th>Players</th>
                <th>Games</th>
                <th>Rolls</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => {
                const s = states[i]?.state;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 font-mono font-bold">{r.code}</td>
                    <td>{fmt(r.createdAt)}</td>
                    <td>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase">{s?.status ?? r.status}</span>
                    </td>
                    <td>{r.hostedByAdmin ? "Organizer" : s?.hostPlayerId ? s.players[s.hostPlayerId]?.nickname ?? "Player" : "—"}</td>
                    <td>{s?.order.length ?? 0}</td>
                    <td>{r.gamesPlayed}</td>
                    <td>{s?.rollCount ?? 0}</td>
                    <td className="space-x-3 whitespace-nowrap text-right">
                      <a href={`/host/${r.code}`} className="font-semibold text-violet-700 hover:underline">
                        Host screen
                      </a>
                      <a href={`/room/${r.code}?watch=1`} target="_blank" className="text-slate-500 hover:underline">
                        Watch
                      </a>
                    </td>
                  </tr>
                );
              })}
              {!rooms.length && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    No rooms yet. Create an event room or let players host from the landing page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">🏆 Winners</h2>
          <a href={`/api/admin/campaigns/${c.id}/export?kind=winners`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            Export CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th>Room</th>
                <th>Round</th>
                <th>Rank</th>
                <th>Nickname</th>
                <th>Prize</th>
                <th>Code</th>
              </tr>
            </thead>
            <tbody>
              {winners.map((w) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="py-2">{fmt(w.createdAt)}</td>
                  <td className="font-mono">{w.roomCode}</td>
                  <td>{w.round}</td>
                  <td>{["🥇", "🥈", "🥉"][w.rank - 1] ?? `#${w.rank}`}</td>
                  <td className="font-semibold">{w.nickname}</td>
                  <td>{w.prize}</td>
                  <td className="font-mono">{w.couponCode ?? "—"}</td>
                </tr>
              ))}
              {!winners.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No winners yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex-1 text-sm text-slate-600">
          <b>Data retention:</b> registration details are anonymised after {c.retentionDays} days. On Supabase you can also schedule{" "}
          <code className="rounded bg-slate-100 px-1">purge_expired_participant_data()</code> with pg_cron.
        </div>
        <PurgeButton campaignId={c.id} days={c.retentionDays} />
        <DeleteCampaignButton campaignId={c.id} name={c.name} />
      </section>
    </div>
  );
}
