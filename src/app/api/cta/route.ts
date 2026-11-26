import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

// Tracks a CTA click, then redirects to the URL configured by the admin.
// Only configured URLs can be targets, so this is not an open redirect.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("c") ?? "";
  const ctaId = url.searchParams.get("id") ?? "";
  const roomCode = (url.searchParams.get("r") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const playerId = url.searchParams.get("p");
  const store = getStore();
  const campaign = await store.getCampaign(campaignId).catch(() => null);
  const cta = campaign?.ctas.find((c) => c.id === ctaId && c.url);
  if (!campaign || !cta) return NextResponse.redirect(new URL("/", url));
  if (rateLimit(`cta:${clientIp(req)}:${ctaId}`, 30, 60_000)) {
    try {
      const room = roomCode.length >= 4 ? await store.getRoomByCode(roomCode) : null;
      const sameCampaign = room && room.campaignId === campaign.id ? room : null;
      const validPlayer =
        sameCampaign && playerId && /^[0-9a-f-]{36}$/i.test(playerId) ? (await store.listPlayers(sameCampaign.id)).some((p) => p.id === playerId) : false;
      await store.addClick({ campaignId: campaign.id, roomId: sameCampaign?.id ?? null, playerId: validPlayer ? playerId : null, ctaId, url: cta.url });
    } catch {
      /* tracking must never block the redirect */
    }
  }
  return NextResponse.redirect(cta.url.startsWith("/") ? new URL(cta.url, url) : cta.url, 302);
}
