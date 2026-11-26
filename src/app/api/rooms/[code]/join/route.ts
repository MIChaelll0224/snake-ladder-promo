import { joinRoom } from "@/lib/server/game";
import { handle, joinInput, json, limited, readJson } from "@/lib/server/http";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    limited(req, "join", 40, 60_000);
    const { code } = await params;
    return json(await joinRoom(code, joinInput(req, await readJson(req))));
  });
}
