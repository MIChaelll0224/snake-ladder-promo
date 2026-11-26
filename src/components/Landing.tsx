"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicCampaign } from "@/lib/types";
import JoinForm from "./JoinForm";
import { BrandShell, CtaButtons, Logo, Sponsors } from "./ui";

export default function Landing({ campaign }: { campaign: PublicCampaign }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [hosting, setHosting] = useState(false);
  const c = campaign;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : null);

  return (
    <BrandShell campaign={c}>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <header className="flex items-center gap-3">
          <Logo campaign={c} size={44} />
          <div>
            <div className="font-display text-lg font-bold leading-tight">{c.businessName}</div>
            <div className="text-xs text-white/60">{c.name}</div>
          </div>
        </header>

        {c.branding.bannerImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.branding.bannerImageUrl} alt="" className="mt-5 max-h-64 w-full rounded-3xl object-cover shadow-xl" />
        )}

        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
          <section>
            {c.branding.bannerText && (
              <span className="inline-block rounded-full bg-[var(--brand-secondary)] px-4 py-1 font-display text-sm font-bold text-[#1f1300]">{c.branding.bannerText}</span>
            )}
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">{c.content.headline}</h1>
            <p className="mt-3 text-lg text-white/85 sm:text-xl">{c.content.tagline}</p>
            <p className="mt-4 text-white/70">{c.content.welcomeMessage}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["👥", `Up to ${c.gameConfig.maxPlayers} players`, "per room"],
                ["🎲", "Take turns rolling", `${c.gameConfig.turnSeconds}s per turn`],
                ["🏆", "Race to 100", c.gameConfig.winnersCount > 1 ? `top ${c.gameConfig.winnersCount} win` : "first one wins"],
              ].map(([i, a, b]) => (
                <div key={a} className="glass rounded-2xl p-3">
                  <div className="text-2xl">{i}</div>
                  <div className="font-display font-bold">{a}</div>
                  <div className="text-sm text-white/60">{b}</div>
                </div>
              ))}
            </div>

            <div className="glass mt-6 rounded-3xl p-5">
              <h2 className="font-display text-xl font-bold">How it works</h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-white/85">
                {c.content.mechanics.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ol>
            </div>

            <div className="mt-6 rounded-3xl bg-[var(--brand-secondary)] p-5 text-[#1f1300] shadow-xl">
              <div className="font-display text-2xl font-bold">🎁 {c.content.prizeTitle}</div>
              {c.prizeByRank.slice(0, c.gameConfig.winnersCount).map((p, i) => (
                <div key={i} className="font-semibold">
                  {["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`} {p}
                </div>
              ))}
              <p className="mt-1">{c.content.prizeDetails}</p>
              {(c.startsAt || c.endsAt) && (
                <p className="mt-2 text-sm font-semibold opacity-80">
                  Promo period: {fmt(c.startsAt) ?? "now"} – {fmt(c.endsAt) ?? "until further notice"}
                </p>
              )}
            </div>
            <CtaButtons campaign={c} place="landing" className="mt-6 !justify-start" />
          </section>

          <section className="glass rounded-3xl p-5 sm:p-6 lg:sticky lg:top-6">
            {!c.isOpen ? (
              <div className="py-8 text-center">
                <div className="text-5xl">⏳</div>
                <p className="mt-3 font-display text-xl font-bold">{c.closedReason}</p>
              </div>
            ) : hosting ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-2xl font-bold">Host a new game</h2>
                  <button className="text-sm underline" onClick={() => setHosting(false)}>
                    ← back
                  </button>
                </div>
                <JoinForm campaign={c} submitLabel="Create room 🚀" />
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold">Join a game</h2>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const k = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                    if (k.length >= 4) router.push(`/join/${k}`);
                  }}
                >
                  <input
                    className="input text-center font-display text-2xl uppercase tracking-[0.3em]"
                    placeholder="CODE"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    aria-label="Room code"
                    autoCapitalize="characters"
                  />
                  <button className="btn btn-primary px-6" disabled={code.trim().length < 4}>
                    Go
                  </button>
                </form>
                <p className="mt-2 text-sm text-white/60">Got a QR code or link from a friend? Just open it — it brings you straight to the room.</p>
                {c.gameConfig.allowPlayerHosting && (
                  <>
                    <div className="my-5 flex items-center gap-3 text-white/40">
                      <div className="h-px flex-1 bg-white/20" /> or <div className="h-px flex-1 bg-white/20" />
                    </div>
                    <button className="btn btn-secondary w-full py-4 text-lg" onClick={() => setHosting(true)}>
                      👑 Host a new game
                    </button>
                    <p className="mt-2 text-center text-sm text-white/60">Create a room and invite up to {c.gameConfig.maxPlayers - 1} friends.</p>
                  </>
                )}
              </>
            )}
          </section>
        </div>
        <Sponsors campaign={c} />
        <footer className="mt-10 text-center text-xs text-white/50">
          <a href={`/privacy/${c.slug}`} className="underline">
            Privacy notice
          </a>{" "}
          · © {new Date().getFullYear()} {c.businessName}
        </footer>
      </div>
    </BrandShell>
  );
}
