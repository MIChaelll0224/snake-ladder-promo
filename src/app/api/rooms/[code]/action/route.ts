import { performAction } from "@/lib/server/game";
import { handle, json, limited, playerToken, readJson } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/security";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    limited(req, "action", 600, 60_000);
    const { code } = await params;
    const body = await readJson(req);
    const admin = body.as === "admin" && (await isAdmin());
    return json(await performAction(code, playerToken(req), admin, body));
  });
}
