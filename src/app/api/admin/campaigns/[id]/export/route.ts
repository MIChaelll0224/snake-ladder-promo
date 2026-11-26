import { GameError } from "@/lib/server/game";
import { handle, requireAdmin } from "@/lib/server/http";
import { getStore } from "@/lib/store";

type P = { params: Promise<{ id: string }> };

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV / formula injection guard
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export async function GET(req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const store = getStore();
    const campaign = await store.getCampaign(id);
    if (!campaign) throw new GameError(404, "Not found");
    const kind = new URL(req.url).searchParams.get("kind") === "winners" ? "winners" : "participants";

    const rows: unknown[][] = [];
    if (kind === "winners") {
      const winners = await store.listWinners(id, 50000);
      rows.push(["date", "room", "round", "rank", "nickname", "prize", "coupon_code", "participant_id"]);
      for (const w of winners) rows.push([w.createdAt, w.roomCode, w.round, w.rank, w.nickname, w.prize, w.couponCode, w.participantId]);
    } else {
      const [parts, players, winners] = await Promise.all([store.listParticipants(id), store.listCampaignPlayers(id), store.listWinners(id, 50000)]);
      const extraKeys = campaign.registration.fields.map((f) => f.key).filter((k) => !["name", "email", "phone"].includes(k));
      rows.push(["participant_id", "registered_at", "name", "email", "phone", ...extraKeys, "marketing_consent", "nicknames", "games_joined", "wins", "anonymized_at"]);
      for (const p of parts) {
        const mine = players.filter((x) => x.participantId === p.id);
        rows.push([
          p.id,
          p.createdAt,
          p.name,
          p.email,
          p.phone,
          ...extraKeys.map((k) => p.extra?.[k] ?? ""),
          p.marketingConsent ? "yes" : "no",
          [...new Set(mine.map((m) => m.nickname))].join(" / "),
          mine.length,
          winners.filter((w) => w.participantId === p.id).length,
          p.anonymizedAt ?? "",
        ]);
      }
    }
    const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${campaign.slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
