import { createRoom, GameError } from "@/lib/server/game";
import { handle, json, requireAdmin } from "@/lib/server/http";
import { getStore } from "@/lib/store";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    return json(await getStore().listRooms((await params).id, 200));
  });
}

/** Creates a room hosted by the admin (event / projector mode). */
export async function POST(_req: Request, { params }: P) {
  return handle(async () => {
    await requireAdmin();
    const campaign = await getStore().getCampaign((await params).id);
    if (!campaign) throw new GameError(404, "Campaign not found");
    return json(await createRoom(campaign, true), 201);
  });
}
