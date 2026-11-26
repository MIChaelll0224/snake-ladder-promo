import Link from "next/link";
import JoinForm from "@/components/JoinForm";
import { BrandShell, Logo } from "@/components/ui";
import { loadRoom, publicCampaign } from "@/lib/server/game";
import JoinRedirect from "./redirect";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await loadRoom(code).catch(() => null);
  if (!ctx)
    return (
      <div className="brand-bg grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-6xl">🔍</div>
          <h1 className="mt-3 font-display text-2xl font-bold">Room “{code.toUpperCase()}” not found</h1>
          <p className="mt-2 text-white/70">Double-check the code with your host.</p>
          <Link href="/" className="btn btn-primary mt-5">
            Back
          </Link>
        </div>
      </div>
    );

  const c = publicCampaign(ctx.campaign);
  const s = ctx.row.state;
  const full = s.order.length >= c.gameConfig.maxPlayers;
  const started = s.status !== "lobby";

  return (
    <BrandShell campaign={c}>
      <JoinRedirect code={ctx.room.code} />
      <div className="mx-auto max-w-lg px-4 py-8">
        <Link href={`/c/${c.slug}`} className="flex items-center gap-3">
          <Logo campaign={c} size={44} />
          <div>
            <div className="font-display text-xl font-bold leading-tight">{c.content.headline}</div>
            <div className="text-sm text-white/60">{c.businessName}</div>
          </div>
        </Link>
        <div className="glass mt-6 rounded-3xl p-5 sm:p-6">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-white/60">Joining room</div>
              <div className="font-display text-4xl font-bold tracking-[0.2em]">{ctx.room.code}</div>
            </div>
            <div className="text-right text-sm text-white/70">
              {s.order.length}/{c.gameConfig.maxPlayers} players
              <div className="mt-1 flex justify-end -space-x-2">
                {s.order.slice(0, 10).map((id) => (
                  <span key={id} className="grid h-7 w-7 place-items-center rounded-full border-2 border-white text-sm" style={{ background: s.players[id].color }}>
                    {s.players[id].avatar}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {!c.isOpen ? (
            <p className="py-6 text-center font-display text-xl">{c.closedReason}</p>
          ) : started || full ? (
            <div className="py-4 text-center">
              <div className="text-5xl">{started ? "🎲" : "🈵"}</div>
              <p className="mt-2 font-display text-xl font-bold">{started ? "This game is already in progress" : "This room is full"}</p>
              <p className="mt-1 text-white/70">{started ? "You can watch it live, or ask the host for the next round." : "Ask the host to open another room."}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {c.gameConfig.allowSpectators && (
                  <Link href={`/room/${ctx.room.code}?watch=1`} className="btn btn-primary">
                    👀 Watch live
                  </Link>
                )}
                <Link href={`/c/${c.slug}`} className="btn btn-outline">
                  Start my own game
                </Link>
              </div>
            </div>
          ) : (
            <JoinForm campaign={c} code={ctx.room.code} />
          )}
        </div>
      </div>
    </BrandShell>
  );
}
