"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";

export function LogoutButton() {
  return (
    <button
      className="text-sm font-semibold text-slate-500 hover:text-slate-900"
      onClick={async () => {
        await api("/api/admin/login", { method: "DELETE" }).catch(() => {});
        window.location.href = "/admin/login";
      }}
    >
      Log out
    </button>
  );
}

export function CreateRoomButton({ campaignId, label = "＋ New event room" }: { campaignId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-violet-700 disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const room = await api<{ code: string }>(`/api/admin/campaigns/${campaignId}/rooms`, { body: {} });
          router.push(`/host/${room.code}`);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed");
          setBusy(false);
        }
      }}
    >
      {busy ? "Creating…" : label}
    </button>
  );
}

export function PurgeButton({ campaignId, days }: { campaignId: string; days: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        onClick={async () => {
          if (!confirm(`Anonymise registration data older than ${days} days? This cannot be undone.`)) return;
          const r = await api<{ anonymized: number }>(`/api/admin/campaigns/${campaignId}/purge`, { body: {} });
          setMsg(`${r.anonymized} record(s) anonymised`);
        }}
      >
        Apply retention now
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}

export function DeleteCampaignButton({ campaignId, name }: { campaignId: string; name: string }) {
  return (
    <button
      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
      onClick={async () => {
        if (prompt(`Type DELETE to permanently delete "${name}" and ALL its rooms, participants and winners.`) !== "DELETE") return;
        await api(`/api/admin/campaigns/${campaignId}`, { method: "DELETE" });
        window.location.href = "/admin";
      }}
    >
      Delete campaign
    </button>
  );
}
