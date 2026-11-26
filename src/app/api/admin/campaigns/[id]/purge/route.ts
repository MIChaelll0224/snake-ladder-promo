import { GameError } from "@/lib/server/game";
import { handle, json, requireAdmin } from "@/lib/server/http";
import { getStore } from "@/lib/store";

type P = { params: Promise<{ id: string }> };

/** Anonymises participant data older than the campaign's retention period. */
export async function POST(_req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    const store = getStore();
    const c = await store.getCampaign((await params).id);
    if (!c) throw new GameError(404, "Not found");
    return json({ anonymized: await store.purgeExpired(c.id, c.retentionDays) });
  });
}
