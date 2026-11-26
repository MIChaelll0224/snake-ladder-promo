import { getRoomView } from "@/lib/server/game";
import { handle, json, limited, playerToken } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/security";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    limited(req, "state", 2000, 60_000);
    const { code } = await params;
    const admin = new URL(req.url).searchParams.get("as") === "admin" && (await isAdmin());
    return json(await getRoomView(code, playerToken(req), admin));
  });
}
