import { defaultCampaign, normalizeCampaign } from "@/lib/defaults";
import { handle, json, readJson, requireAdmin } from "@/lib/server/http";
import { getStore } from "@/lib/store";
import type { Campaign } from "@/lib/types";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return json(await getStore().listCampaigns());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(req);
    const c = normalizeCampaign({ ...body, id: "" } as Partial<Campaign> & Record<string, unknown>, defaultCampaign({ status: "draft" }));
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      return json(await getStore().insertCampaign(rest), 201);
    } catch (e) {
      const m = (e as Error).message;
      return json({ error: /slug|duplicate/i.test(m) ? "That URL slug is already used." : m }, 400);
    }
  });
}
