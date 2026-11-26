import { getStore } from "@/lib/store";

// Used by Render's health check.
export async function GET() {
  return Response.json({ ok: true, store: getStore().kind }, { headers: { "Cache-Control": "no-store" } });
}
