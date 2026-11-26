import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";

export default async function Participants({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const c = await store.getCampaign(id);
  if (!c) notFound();
  const [parts, players, winners] = await Promise.all([store.listParticipants(id), store.listCampaignPlayers(id), store.listWinners(id, 50000)]);
  const extraKeys = c.registration.fields.filter((f) => !["name", "email", "phone"].includes(f.key));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Link href={`/admin/campaigns/${id}`} className="text-sm text-slate-500 hover:underline">
            ← {c.name}
          </Link>
          <h1 className="font-display text-3xl font-bold">Participants</h1>
          <p className="text-slate-500">
            {parts.length} registered · {parts.filter((p) => p.marketingConsent).length} opted in to marketing · {players.length} total joins
          </p>
        </div>
        <a href={`/api/admin/campaigns/${id}/export?kind=participants`} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-violet-700">
          ⬇ Export participants CSV
        </a>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Registered</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              {extraKeys.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>Consent</th>
              <th>Nicknames</th>
              <th>Games</th>
              <th>Wins</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => {
              const mine = players.filter((x) => x.participantId === p.id);
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(p.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{p.anonymizedAt ? <i className="text-slate-400">anonymised</i> : p.name ?? "—"}</td>
                  <td>{p.email ?? "—"}</td>
                  <td>{p.phone ?? "—"}</td>
                  {extraKeys.map((f) => (
                    <td key={f.key}>{p.extra?.[f.key] ?? "—"}</td>
                  ))}
                  <td>{p.marketingConsent ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">YES</span> : "no"}</td>
                  <td>{[...new Set(mine.map((m) => m.nickname))].join(", ")}</td>
                  <td>{mine.length}</td>
                  <td>{winners.filter((w) => w.participantId === p.id).length}</td>
                </tr>
              );
            })}
            {!parts.length && (
              <tr>
                <td colSpan={9 + extraKeys.length} className="py-8 text-center text-slate-500">
                  Nobody has registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
