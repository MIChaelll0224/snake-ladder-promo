import Link from "next/link";
import { campaignOpenState } from "@/lib/defaults";
import { getStore } from "@/lib/store";
import { MetricGrid } from "@/components/admin/Metrics";
import { CreateRoomButton } from "@/components/admin/AdminActions";

export default async function AdminHome() {
  const store = getStore();
  const campaigns = await store.listCampaigns();
  const [total, ...each] = await Promise.all([store.metrics(), ...campaigns.map((c) => store.metrics(c.id))]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-500">Engagement across all campaigns</p>
        <div className="mt-4">
          <MetricGrid m={total} />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Campaigns</h2>
          <Link href="/admin/campaigns/new" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-violet-700">
            ＋ New campaign
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c, i) => {
            const open = campaignOpenState(c);
            const m = each[i];
            return (
              <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${c.branding.primary}, ${c.branding.secondary})` }} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/campaigns/${c.id}`} className="block truncate font-display text-lg font-bold hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-sm text-slate-500">
                      /c/{c.slug} · {c.businessName}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      open.open ? "bg-emerald-100 text-emerald-700" : c.status === "draft" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {open.open ? "LIVE" : c.status.toUpperCase()}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                  {[
                    ["Players", m.players],
                    ["Games", m.gamesPlayed],
                    ["Winners", m.winners],
                    ["Clicks", m.ctaClicks],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-slate-50 py-2">
                      <div className="font-display text-xl font-bold">{v}</div>
                      <div className="text-xs text-slate-500">{k}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/campaigns/${c.id}`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                    Open
                  </Link>
                  <Link href={`/admin/campaigns/${c.id}/edit`} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                    Edit settings
                  </Link>
                  <CreateRoomButton campaignId={c.id} />
                </div>
              </div>
            );
          })}
          {!campaigns.length && <p className="text-slate-500">No campaigns yet.</p>}
        </div>
      </div>
    </div>
  );
}
