import { campaignOpenState } from "@/lib/defaults";
import { createRoom, GameError, getActiveCampaign, joinRoom } from "@/lib/server/game";
import { handle, joinInput, json, limited, readJson } from "@/lib/server/http";
import { getStore } from "@/lib/store";

// A player creates a new room for a campaign and joins it as the host.
export async function POST(req: Request) {
  return handle(async () => {
    limited(req, "create-room", 20, 60_000);
    const body = await readJson(req);
    const slug = typeof body.campaign === "string" ? body.campaign : "";
    const campaign = slug ? await getStore().getCampaignBySlug(slug) : await getActiveCampaign();
    if (!campaign) throw new GameError(404, "Promo not found.");
    const open = campaignOpenState(campaign);
    if (!open.open) throw new GameError(403, open.reason ?? "Promo closed.");
    if (!campaign.gameConfig.allowPlayerHosting) throw new GameError(403, "Rooms for this promo are created by the organizer. Ask for a room code.");
    const input = joinInput(req, body);
    if (input.nickname.trim().length < 2) throw new GameError(400, "Please enter a nickname (2–16 characters).");
    const room = await createRoom(campaign, false);
    return json(await joinRoom(room.code, input));
  });
}
