import { normalizeCampaign } from "@/lib/defaults";
import { GameError } from "@/lib/server/game";
import { handle, json, readJson, requireAdmin } from "@/lib/server/http";
import { getStore } from "@/lib/store";
import type { Campaign } from "@/lib/types";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    const c = await getStore().getCampaign((await params).id);
    if (!c) throw new GameError(404, "Not found");
    return json(c);
  });
}

export async function PUT(req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const store = getStore();
    const current = await store.getCampaign(id);
    if (!current) throw new GameError(404, "Not found");
    const body = await readJson(req);
    const c = normalizeCampaign({ ...body, id } as Partial<Campaign> & Record<string, unknown>, current);
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      return json(await store.updateCampaign(id, rest));
    } catch (e) {
      const m = (e as Error).message;
      return json({ error: /slug|duplicate/i.test(m) ? "That URL slug is already used." : m }, 400);
    }
  });
}

export async function DELETE(_req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    await getStore().deleteCampaign((await params).id);
    return json({ ok: true });
  });
}
