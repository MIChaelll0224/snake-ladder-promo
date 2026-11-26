"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Milestone, MoveResult, PlayerView, RoomView } from "@/lib/types";
import { api, ApiError, clearToken, ctaHref, getToken } from "@/lib/client/api";
import { isMuted, setMuted, sfx, unlockAudio } from "@/lib/client/sound";
import { realtimeEnabled, subscribeRoom } from "@/lib/client/realtime";
import { stepPath } from "@/lib/engine";
import { Board } from "./Board";
import { Dice } from "./Dice";
import { BrandShell, CopyButton, CtaButtons, Logo, Modal, QrCode, Sponsors } from "./ui";

type Mode = "player" | "spectator" | "admin";

const MEDALS = ["🥇", "🥈", "🥉"];
const rankLabel = (r: number | null) => (r == null ? "" : MEDALS[r - 1] ?? `#${r}`);
const DICE_ROLL_MS = 1000;
/** How long the pawn animation of a move takes on screen. */
const moveMs = (m?: MoveResult | null) => (m ? stepPath(m).length * 210 + (m.to !== m.landed ? 1300 : 350) : 0);

export default function RoomClient({ code, mode }: { code: string; mode: Mode }) {
  const router = useRouter();
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [revealed, setRevealed] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [yourTurn, setYourTurn] = useState<number | null>(null); // turnNo the pop-up is for
  const [lost, setLost] = useState(false);

  const offset = useRef(0);
  const token = useRef<string | null>(null);
  const inflight = useRef(false);
  const tickedFor = useRef<number | null>(null);
  const seenMilestones = useRef(new Set<string>());
  const popupShownFor = useRef<number | null>(null);
  const lastVersion = useRef(-1);

  // ---------------------------------------------------------------- data
  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const v = await api<RoomView>(`/api/rooms/${code}${mode === "admin" ? "?as=admin" : ""}`, { token: token.current });
      offset.current = v.serverNow - Date.now();
      if (v.version >= lastVersion.current) {
        lastVersion.current = v.version;
        setView(v);
      }
      setError(null);
      if (mode === "player" && token.current && v.viewer !== "player") {
        clearToken(code);
        token.current = null;
        setLost(true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Connection problem — retrying…");
    } finally {
      inflight.current = false;
    }
  }, [code, mode]);

  useEffect(() => {
    setMutedState(isMuted());
    token.current = mode === "player" ? getToken(code) : null;
    if (mode === "player" && !token.current) {
      router.replace(`/join/${code}`);
      return;
    }
    void refresh();
    const poll = setInterval(refresh, realtimeEnabled() ? 4000 : 1000);
    const unsub = subscribeRoom(code, () => void refresh());
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(poll);
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [code, mode, refresh, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const action = useCallback(
    async (type: string, extra: Record<string, unknown> = {}) => {
      unlockAudio();
      setBusy(true);
      try {
        await api(`/api/rooms/${code}/action`, { body: { type, ...extra, ...(mode === "admin" ? { as: "admin" } : {}) }, token: token.current });
        await refresh();
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Action failed");
        setTimeout(() => setToast(null), 3500);
      } finally {
        setBusy(false);
      }
    },
    [code, mode, refresh],
  );

  // turn timer: when time is up, any client nudges the server, which rolls for the player
  const serverNow = now + offset.current;
  useEffect(() => {
    if (!view || view.room.status !== "playing" || view.turnEndsAt == null) return;
    if (serverNow >= view.turnEndsAt && tickedFor.current !== view.turnEndsAt) {
      tickedFor.current = view.turnEndsAt;
      setTimeout(
        () =>
          void api(`/api/rooms/${code}/action`, { body: { type: "tick" } })
            .catch(() => {})
            .then(() => refresh()),
        Math.random() * 400,
      );
    }
  }, [serverNow, view, code, refresh]);

  // ---------------------------------------------------------------- dice reveal choreography
  const rollCount = view?.rollCount ?? 0;
  const hasView = !!view;
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRollCount = useRef(0);
  latestRollCount.current = rollCount;
  useEffect(() => {
    if (!hasView) return;
    if (revealed == null || rollCount < revealed) {
      setRevealed(rollCount); // first load / rematch: no animation
      return;
    }
    if (rollCount > revealed && !rollTimer.current) {
      setRolling(true);
      if (!isMuted()) sfx.roll();
      rollTimer.current = setTimeout(() => {
        rollTimer.current = null;
        setRolling(false);
        setRevealed(latestRollCount.current);
      }, DICE_ROLL_MS);
    }
  }, [rollCount, revealed, hasView]);
  useEffect(() => () => void (rollTimer.current && clearTimeout(rollTimer.current)), []);

  const me = useMemo(() => (view?.me ? view.players.find((p) => p.id === view.me!.playerId) ?? null : null), [view]);
  const caughtUp = revealed != null && revealed === rollCount;
  const lastRoll = view?.lastRoll ?? null;
  const moves = caughtUp && lastRoll ? { [lastRoll.playerId]: lastRoll.move } : undefined;
  const status = view?.room.status;
  const myTurn = !!me && view?.turn === me.id && status === "playing";

  // "Your turn!" pop-up, shown once per turn after the previous move finished animating
  const turnNo = view?.turnNo ?? 0;
  useEffect(() => {
    if (!myTurn || !caughtUp) return;
    if (popupShownFor.current === turnNo) return;
    const t = setTimeout(() => {
      popupShownFor.current = turnNo;
      setYourTurn(turnNo);
      if (!isMuted()) sfx.yourTurn();
      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {
        /* not supported */
      }
    }, moveMs(lastRoll?.move) + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, caughtUp, turnNo]);
  useEffect(() => {
    if (!myTurn) setYourTurn(null);
  }, [myTurn]);

  // milestone pop-ups for my own moves
  useEffect(() => {
    if (!view || !me || !caughtUp || !lastRoll || lastRoll.playerId !== me.id) return;
    const m = lastRoll.move;
    const hit = view.campaign.milestones.find((ms) => {
      if (seenMilestones.current.has(`${view.room.round}:${ms.id}`)) return false;
      if (ms.trigger === "ladder") return m.kind === "ladder";
      if (ms.trigger === "snake") return m.kind === "snake";
      if (ms.trigger === "finish") return m.kind === "finish";
      return ms.value != null && m.from < ms.value && Math.max(m.to, m.landed) >= ms.value;
    });
    if (!hit) return;
    seenMilestones.current.add(`${view.room.round}:${hit.id}`);
    const t = setTimeout(() => setMilestone(hit), moveMs(m));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, caughtUp]);

  // finish screen + celebration
  const meRef = useRef(me);
  meRef.current = me;
  useEffect(() => {
    if (status !== "finished") {
      setShowFinish(false);
      return;
    }
    if (!caughtUp) return;
    const t = setTimeout(async () => {
      setShowFinish(true);
      setMilestone(null);
      const iWon = !!(meRef.current && meRef.current.rank != null);
      if (!isMuted() && (iWon || mode !== "player")) sfx.win();
      const confetti = (await import("canvas-confetti")).default;
      const burst = (o: object) => confetti({ particleCount: 90, spread: 80, startVelocity: 45, ...o });
      burst({ origin: { x: 0.2, y: 0.7 } });
      burst({ origin: { x: 0.8, y: 0.7 } });
      setTimeout(() => burst({ particleCount: 160, spread: 140, origin: { y: 0.5 } }), 500);
    }, 2200);
    return () => clearTimeout(t);
  }, [status, caughtUp, mode]);

  // ---------------------------------------------------------------- render
  if (lost)
    return (
      <Centered>
        <div className="text-5xl">👋</div>
        <h1 className="mt-2 font-display text-2xl font-bold">You are no longer in this room</h1>
        <p className="mt-2 text-white/70">You may have been removed by the host or left the game.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href={`/join/${code}`} className="btn btn-primary">
            Join again
          </Link>
          <Link href={`/room/${code}?watch=1`} className="btn btn-outline">
            Watch
          </Link>
        </div>
      </Centered>
    );

  if (!view)
    return (
      <Centered>
        {error ? (
          <>
            <div className="text-5xl">🙈</div>
            <p className="mt-3 text-lg">{error}</p>
            <Link href="/" className="btn btn-primary mt-5">
              Back to home
            </Link>
          </>
        ) : (
          <div className="wiggle text-6xl">🎲</div>
        )}
      </Centered>
    );

  const c = view.campaign;
  const cfg = c.gameConfig;
  const isHost = mode === "admin" || (!!me && view.hostPlayerId === me.id);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${view.room.code}` : `/join/${view.room.code}`;
  const displayPos = (p: PlayerView) => (!caughtUp && lastRoll?.playerId === p.id ? lastRoll.move.from : p.position);
  const current = view.turn ? view.players.find((p) => p.id === view.turn) ?? null : null;
  const startingIn = view.startedAt ? Math.ceil((view.startedAt + cfg.startCountdownSec * 1000 - serverNow) / 1000) : 0;
  const secondsLeft = view.turnEndsAt != null ? Math.min(cfg.turnSeconds, Math.max(0, Math.ceil((view.turnEndsAt - serverNow) / 1000))) : null;
  const canRoll = myTurn && caughtUp && !rolling && !busy && startingIn <= 0;
  const roll = () => {
    setYourTurn(null);
    void action("roll", { turnNo: view.turnNo });
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) unlockAudio();
  };

  return (
    <BrandShell campaign={c}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/25 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-5">
          <Link href={`/c/${c.slug}`} className="flex min-w-0 items-center gap-2">
            <Logo campaign={c} size={34} />
            <span className="truncate font-display text-lg font-bold">{c.content.headline}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full bg-white/10 px-3 py-1 text-sm sm:inline">
              Room <b className="font-display tracking-widest">{view.room.code}</b>
              {view.room.round > 1 && <> · Round {view.room.round}</>}
            </span>
            {mode === "spectator" && <span className="rounded-full bg-sky-500/30 px-3 py-1 text-xs font-bold uppercase">👀 Watching</span>}
            {mode === "admin" && <span className="rounded-full bg-amber-500/30 px-3 py-1 text-xs font-bold uppercase">🛠 Host screen</span>}
            <button onClick={toggleMute} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg" aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
        {error && <div className="bg-red-500/80 px-3 py-1 text-center text-sm">{error}</div>}
      </header>

      {c.branding.bannerText && status === "lobby" && (
        <div className="bg-[var(--brand-secondary)] px-3 py-1.5 text-center font-display text-sm font-semibold text-[#1f1300]">{c.branding.bannerText}</div>
      )}

      <main className="mx-auto max-w-7xl px-3 pb-28 pt-4 sm:px-5">
        {mode === "admin" && <AdminControls view={view} busy={busy} action={action} />}

        {status === "lobby" ? (
          <Lobby view={view} me={me} isHost={isHost} mode={mode} busy={busy} action={action} shareUrl={shareUrl} />
        ) : (
          <>
            <TurnBanner
              current={current}
              myTurn={myTurn}
              status={status!}
              secondsLeft={secondsLeft}
              turnSeconds={cfg.turnSeconds}
              startingIn={startingIn}
              winners={view.winners.map((id) => view.players.find((p) => p.id === id)!).filter(Boolean)}
            />

            <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="mx-auto w-full max-w-[760px]">
                <Board
                  layout={view.board}
                  pawns={view.players.map((p) => ({ id: p.id, color: p.color, avatar: p.avatar, position: displayPos(p) }))}
                  moves={moves}
                  animKey={revealed ?? 0}
                  sound={!muted}
                  activeId={status === "playing" && caughtUp ? view.turn : null}
                />
              </div>

              <aside className="space-y-4">
                <section className="glass rounded-3xl p-4">
                  <div className="flex items-center gap-4">
                    <Dice value={lastRoll?.roll ?? null} rolling={rolling} max={cfg.diceMax} size={84} />
                    <div className="min-w-0 flex-1">
                      {rolling ? (
                        <div className="font-display text-xl font-bold">Rolling…</div>
                      ) : lastRoll ? (
                        <>
                          <div className="text-xs font-bold uppercase tracking-widest text-white/60">Last roll</div>
                          <div className="font-display text-lg font-bold leading-tight">
                            {view.players.find((p) => p.id === lastRoll.playerId)?.nickname ?? "?"} rolled {lastRoll.roll}
                            {lastRoll.auto && <span className="ml-1 text-xs font-normal text-white/60">(auto)</span>}
                          </div>
                          <MoveText m={lastRoll.move} />
                        </>
                      ) : (
                        <div className="text-white/70">No rolls yet</div>
                      )}
                    </div>
                  </div>
                  {me && status === "playing" && (
                    <button className={`btn mt-4 w-full py-4 text-xl ${canRoll ? "btn-accent pulse-ring" : "btn-outline"}`} disabled={!canRoll} onClick={roll}>
                      {myTurn ? (startingIn > 0 ? `Starting in ${startingIn}…` : "🎲 ROLL THE DICE") : `Waiting for ${current?.nickname ?? "…"}`}
                    </button>
                  )}
                </section>

                <PlayersPanel players={view.players} turn={status === "playing" ? view.turn : null} meId={me?.id} displayPos={displayPos} />
                <ActivityLog logs={view.logs} />
                <CtaButtons campaign={c} place="game" roomCode={view.room.code} playerId={me?.id} />
              </aside>
            </div>
          </>
        )}
        <Sponsors campaign={c} />
      </main>

      {/* sticky roll button on phones */}
      {myTurn && status === "playing" && !yourTurn && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 lg:hidden">
          <button className={`btn w-full py-4 text-xl shadow-2xl ${canRoll ? "btn-accent" : "btn-outline bg-black/60"}`} disabled={!canRoll} onClick={roll}>
            🎲 ROLL {secondsLeft != null && canRoll ? `· ${secondsLeft}s` : ""}
          </button>
        </div>
      )}

      {toast && <div className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[92vw] rounded-full bg-gray-900/95 px-5 py-3 text-center text-sm shadow-xl float-in">{toast}</div>}

      {/* YOUR TURN pop-up */}
      {yourTurn != null && myTurn && me && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setYourTurn(null)}>
          <div className="your-turn-pop w-full max-w-sm rounded-[2rem] bg-white p-6 text-center text-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-white text-5xl shadow-lg" style={{ background: me.color }}>
              {me.avatar}
            </span>
            <div className="mt-3 text-sm font-bold uppercase tracking-widest text-gray-500">It&apos;s your turn</div>
            <div className="font-display text-4xl font-bold leading-tight">
              Your turn, <span style={{ color: me.color }}>{me.nickname}</span>!
            </div>
            <p className="mt-1 text-gray-500">You&apos;re on square {me.position || "START"}. Roll the dice!</p>
            <button className="btn btn-primary mt-5 w-full py-5 text-2xl" onClick={roll} disabled={!canRoll}>
              🎲 ROLL
            </button>
            {secondsLeft != null && (
              <p className="mt-3 text-sm text-gray-500">
                The computer rolls for you in <b>{secondsLeft}s</b>
              </p>
            )}
          </div>
        </div>
      )}

      <Modal open={!!milestone} onClose={() => setMilestone(null)}>
        {milestone && (
          <div className="text-center">
            <div className="font-display text-2xl font-bold">{milestone.title}</div>
            <p className="mt-2 text-gray-600">{milestone.message}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {milestone.ctaId && c.ctas.some((x) => x.id === milestone.ctaId) && (
                <a href={ctaHref(c.id, milestone.ctaId, view.room.code, me?.id)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  {c.ctas.find((x) => x.id === milestone.ctaId)!.label}
                </a>
              )}
              <button className="btn btn-secondary" onClick={() => setMilestone(null)}>
                Keep playing
              </button>
            </div>
          </div>
        )}
      </Modal>

      <FinishModal open={showFinish && status === "finished"} onClose={() => setShowFinish(false)} view={view} me={me} isHost={isHost} busy={busy} action={action} mode={mode} />
    </BrandShell>
  );
}

// ====================================================================== pieces

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-bg grid min-h-dvh place-items-center p-6 text-center">
      <div>{children}</div>
    </div>
  );
}

function Avatar({ p, size = 36 }: { p: Pick<PlayerView, "avatar" | "color">; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full border-2 border-white shadow" style={{ background: p.color, width: size, height: size, fontSize: size * 0.55 }}>
      {p.avatar}
    </span>
  );
}

function MoveText({ m }: { m: MoveResult }) {
  if (m.kind === "ladder") return <div className="text-sm font-semibold text-emerald-300">🪜 Ladder! {m.landed} → {m.to}</div>;
  if (m.kind === "snake") return <div className="text-sm font-semibold text-rose-300">🐍 Snake! {m.landed} → {m.to}</div>;
  if (m.kind === "finish") return <div className="text-sm font-semibold text-amber-300">🏆 Reached 100!</div>;
  if (m.kind === "blocked") return <div className="text-sm text-white/70">✋ Needs exactly {100 - m.from}</div>;
  if (m.kind === "bounce") return <div className="text-sm font-semibold text-sky-300">↩️ Too many! Bounced back to {m.to}</div>;
  return (
    <div className="text-sm text-white/70">
      {m.from || "Start"} → {m.to}
    </div>
  );
}

function TurnBanner({
  current,
  myTurn,
  status,
  secondsLeft,
  turnSeconds,
  startingIn,
  winners,
}: {
  current: PlayerView | null;
  myTurn: boolean;
  status: string;
  secondsLeft: number | null;
  turnSeconds: number;
  startingIn: number;
  winners: PlayerView[];
}) {
  const progress = secondsLeft == null ? 0 : secondsLeft / Math.max(1, turnSeconds);
  return (
    <section
      className={`ball-bar sticky top-[54px] z-20 flex items-center gap-3 rounded-3xl px-4 py-3 shadow-lg transition-colors sm:px-5 ${
        myTurn ? "my-turn" : "border border-white/15"
      }`}
    >
      {status === "finished" ? (
        <div className="font-display text-xl font-bold">🏁 Game over — {winners.map((w) => w.nickname).join(" & ") || "no winner"} won!</div>
      ) : status === "paused" ? (
        <div className="font-display text-xl font-bold">⏸ Game paused by the host</div>
      ) : current ? (
        <>
          <Avatar p={current} size={44} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-widest text-white/70">{startingIn > 0 ? `Starting in ${startingIn}s` : "Now playing"}</div>
            <div className="truncate font-display text-2xl font-bold leading-tight">{myTurn ? "YOUR TURN! 🎲" : `${current.nickname}'s turn`}</div>
          </div>
          {secondsLeft != null && (
            <div className="relative grid h-14 w-14 shrink-0 place-items-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgb(255 255 255 / .2)" strokeWidth="5" />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="none"
                  stroke={secondsLeft <= 5 ? "#f87171" : "var(--brand-secondary)"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - progress)}
                  style={{ transition: "stroke-dashoffset .25s linear" }}
                />
              </svg>
              <span className="font-display text-lg font-bold">{secondsLeft}</span>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function PlayersPanel({ players, turn, meId, displayPos }: { players: PlayerView[]; turn: string | null; meId?: string; displayPos: (p: PlayerView) => number }) {
  return (
    <section className="glass rounded-3xl p-4">
      <h3 className="mb-2 font-display text-lg font-bold">👥 Players (turn order)</h3>
      <ol className="space-y-1.5">
        {players.map((p) => {
          const active = p.id === turn;
          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${active ? "bg-[var(--brand-secondary)] text-[#1f1300]" : p.id === meId ? "bg-white/20" : "bg-white/5"}`}
            >
              <span className="w-5 text-center">{active ? "▶" : ""}</span>
              <Avatar p={p} size={28} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {p.nickname} {p.id === meId && <span className="opacity-60">(You)</span>}
                {!p.online && <span className="ml-1 text-xs opacity-60">· offline</span>}
              </span>
              {p.rank != null ? <span className="text-lg">{rankLabel(p.rank)}</span> : <span className="w-9 text-right font-display font-bold">{displayPos(p) || "–"}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ActivityLog({ logs }: { logs: RoomView["logs"] }) {
  return (
    <section className="glass rounded-3xl p-4">
      <h3 className="mb-2 font-display text-lg font-bold">📣 Game log</h3>
      <ul className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
        {logs.map((l) => (
          <li
            key={l.id}
            className={`rounded-lg px-2 py-1 ${
              l.type === "ladder" ? "bg-emerald-500/20" : l.type === "snake" ? "bg-rose-500/20" : l.type === "finish" || l.type === "gameover" ? "bg-amber-400/30 font-bold" : "bg-white/5"
            }`}
          >
            {l.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Lobby({
  view,
  me,
  isHost,
  mode,
  busy,
  action,
  shareUrl,
}: {
  view: RoomView;
  me: PlayerView | null;
  isHost: boolean;
  mode: Mode;
  busy: boolean;
  action: (t: string, e?: Record<string, unknown>) => Promise<void>;
  shareUrl: string;
}) {
  const c = view.campaign;
  const cfg = c.gameConfig;
  const notReady = view.players.filter((p) => !p.ready);
  const enough = view.players.length >= cfg.minPlayers;
  const canStart = isHost && enough && notReady.length === 0;
  const slots = Array.from({ length: cfg.maxPlayers }, (_, i) => view.players[i] ?? null);
  const startHint = !enough
    ? `Need at least ${cfg.minPlayers} players`
    : notReady.length
      ? `Waiting for ${notReady.map((p) => p.nickname).join(", ")} to be ready`
      : "Everyone is ready!";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <section className="space-y-5">
        <div className="glass rounded-3xl p-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <QrCode text={shareUrl} size={mode === "admin" ? 220 : 150} />
            <div className="text-center sm:text-left">
              <div className="text-xs font-bold uppercase tracking-widest text-white/60">Room code</div>
              <div className="font-display text-5xl font-bold tracking-[0.2em] sm:text-6xl">{view.room.code}</div>
              <div className="mt-1 break-all text-sm text-white/60">{shareUrl.replace(/^https?:\/\//, "")}</div>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <CopyButton text={shareUrl} label="Copy link" />
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button
                    className="btn btn-outline px-4 py-2 text-sm"
                    onClick={() => navigator.share({ title: c.content.headline, text: `Join my ${c.content.headline} game! Room code ${view.room.code}`, url: shareUrl }).catch(() => {})}
                  >
                    Share
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">
              Players {view.players.length}/{cfg.maxPlayers}
            </h2>
            <span className="text-sm text-white/70">{view.players.filter((p) => p.ready).length} ready</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {slots.map((p, i) =>
              p ? (
                <li key={p.id} className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${p.id === me?.id ? "bg-white/25" : "bg-white/10"}`}>
                  <Avatar p={p} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {p.nickname} {p.id === me?.id && <span className="text-white/60">(You)</span>}
                    </div>
                    <div className="text-xs text-white/60">{p.isHost ? "👑 Host" : p.online ? "Online" : "Offline"}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.ready ? "bg-emerald-500" : "bg-white/20"}`}>{p.ready ? "READY" : "…"}</span>
                  {isHost && !p.isHost && (
                    <button className="ml-1 rounded-full bg-white/10 px-2 text-sm hover:bg-rose-500" title="Remove player" onClick={() => action("kick", { playerId: p.id })} disabled={busy}>
                      ✕
                    </button>
                  )}
                </li>
              ) : (
                <li key={`e${i}`} className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-white/15 px-3 py-2 text-white/40">
                  <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white/5">?</span> Waiting for player…
                </li>
              ),
            )}
          </ul>

          <div className="mt-5 flex flex-col items-center gap-3">
            {me && !me.isHost && (
              <button className={`btn w-full max-w-sm py-4 text-xl ${me.ready ? "btn-outline" : "btn-accent pulse-ring"}`} disabled={busy} onClick={() => action(me.ready ? "unready" : "ready")}>
                {me.ready ? "✅ Ready! (tap to cancel)" : "I'm READY!"}
              </button>
            )}
            {isHost && (
              <>
                <button className="btn btn-primary w-full max-w-sm py-4 text-xl" disabled={!canStart || busy} onClick={() => action("start")}>
                  🚀 Start game
                </button>
                <div className="text-center text-sm text-white/70">{startHint}</div>
              </>
            )}
            {!isHost && me && <div className="text-sm text-white/70">{me.ready ? "Waiting for the host to start…" : "Tap READY when you're set."}</div>}
            {mode === "spectator" && <div className="text-sm text-white/70">You are watching. The game starts when the host is ready.</div>}
            {me && (
              <button
                className="text-sm text-white/50 underline"
                onClick={async () => {
                  if (confirm("Leave this room?")) {
                    await action("leave");
                    clearToken(view.room.code);
                    window.location.href = `/c/${c.slug}`;
                  }
                }}
              >
                Leave room
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="glass rounded-3xl p-5">
          <h2 className="mb-2 font-display text-xl font-bold">How to play</h2>
          <ol className="list-decimal space-y-1 pl-5 text-white/85">
            {c.content.mechanics.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-white/60">
            You have {cfg.turnSeconds} seconds per turn. {cfg.finishRule === "bounce" ? "You must land exactly on 100 — extra steps bounce you back (98 + 4 → 98)." : cfg.finishRule === "exact" ? "You need the exact number to land on 100." : ""}{" "}
            {cfg.extraTurnOnSix ? `Rolling a ${cfg.diceMax} gives you another turn!` : ""}
          </p>
          {(c.content.prizeTitle || c.prizeByRank.length > 0) && (
            <div className="mt-4 rounded-2xl bg-[var(--brand-secondary)] p-4 text-[#1f1300]">
              <div className="font-display text-lg font-bold">🎁 {c.content.prizeTitle}</div>
              {c.prizeByRank.slice(0, cfg.winnersCount).map((p, i) => (
                <div key={i} className="text-sm font-semibold">
                  {MEDALS[i] ?? `#${i + 1}`} {p}
                </div>
              ))}
              <p className="mt-1 text-sm">{c.content.prizeDetails}</p>
            </div>
          )}
        </div>
        <CtaButtons campaign={c} place="lobby" roomCode={view.room.code} playerId={me?.id} />
      </section>
    </div>
  );
}

function AdminControls({ view, busy, action }: { view: RoomView; busy: boolean; action: (t: string, e?: Record<string, unknown>) => Promise<void> }) {
  const s = view.room.status;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-400/15 p-3 text-sm">
      <span className="font-bold">Organizer controls:</span>
      {s === "playing" && (
        <>
          <button className="btn btn-outline px-3 py-1.5 text-sm" disabled={busy} onClick={() => action("pause")}>
            ⏸ Pause
          </button>
          <button className="btn btn-outline px-3 py-1.5 text-sm" disabled={busy} onClick={() => action("autoroll")}>
            🎲 Roll for current player
          </button>
        </>
      )}
      {s === "paused" && (
        <button className="btn btn-accent px-3 py-1.5 text-sm" disabled={busy} onClick={() => action("resume")}>
          ▶ Resume
        </button>
      )}
      {(s === "playing" || s === "paused") && (
        <button className="btn btn-outline px-3 py-1.5 text-sm" disabled={busy} onClick={() => confirm("End this game now?") && action("end")}>
          🛑 End game
        </button>
      )}
      {s === "finished" && (
        <button className="btn btn-primary px-3 py-1.5 text-sm" disabled={busy} onClick={() => action("rematch")}>
          🔁 New round (same players)
        </button>
      )}
      <Link href="/admin" className="ml-auto underline">
        Back to dashboard
      </Link>
    </div>
  );
}

function FinishModal({
  open,
  onClose,
  view,
  me,
  isHost,
  busy,
  action,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  view: RoomView;
  me: PlayerView | null;
  isHost: boolean;
  busy: boolean;
  action: (t: string) => Promise<void>;
  mode: Mode;
}) {
  const c = view.campaign;
  const winners = view.winners.map((id) => view.players.find((p) => p.id === id)).filter(Boolean) as PlayerView[];
  const iWon = !!me && me.rank != null;
  const standings = [...view.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.position - a.position);
  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="text-center">
        <div className="text-6xl">{iWon ? "🏆" : mode === "player" ? "🎉" : "🏁"}</div>
        <h2 className="mt-1 font-display text-3xl font-bold">
          {iWon ? `You finished ${rankLabel(me!.rank)}!` : winners.length ? `${winners.map((w) => w.nickname).join(" & ")} won!` : "Game over"}
        </h2>
        <p className="mt-2 text-gray-600">{iWon ? c.content.winnerMessage : mode === "player" ? c.content.loserMessage : c.content.prizeDetails}</p>

        {me && view.me?.prize && <div className="mt-4 rounded-2xl bg-amber-100 p-3 font-display text-lg font-bold text-amber-900">🎁 {view.me.prize}</div>}
        {me && view.me?.couponCode && (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-[var(--brand-primary)] p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500">{iWon ? "Your winning code" : "Your thank-you code"}</div>
            <div className="my-1 select-all font-mono text-3xl font-bold tracking-wider text-[var(--brand-primary)]">{view.me.couponCode}</div>
            <CopyButton text={view.me.couponCode} label="Copy code" className="btn btn-primary px-4 py-2 text-sm" />
            <p className="mt-2 text-xs text-gray-500">Take a screenshot of this screen to claim. {c.content.prizeDetails}</p>
          </div>
        )}

        <ol className="mx-auto mt-5 max-w-sm space-y-1 text-left">
          {standings.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${p.rank != null ? "bg-amber-100" : "bg-gray-100"}`}>
              <span className="w-7 font-display font-bold">{p.rank != null ? rankLabel(p.rank) : i + 1}</span>
              <span className="grid h-7 w-7 place-items-center rounded-full text-sm" style={{ background: p.color }}>
                {p.avatar}
              </span>
              <span className="flex-1 truncate font-semibold">{p.nickname}</span>
              <span className="font-display font-bold">{p.position}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {c.ctas
            .filter((x) => x.showOn.includes("finish"))
            .map((x) => (
              <a key={x.id} href={ctaHref(c.id, x.id, view.room.code, me?.id)} target="_blank" rel="noopener noreferrer" className={`btn btn-${x.style === "outline" ? "secondary" : x.style} text-sm`}>
                {x.label}
              </a>
            ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {isHost && (
            <button className="btn btn-accent" disabled={busy} onClick={() => action("rematch")}>
              🔁 Rematch
            </button>
          )}
          {!isHost && me && <span className="text-sm text-gray-500">Waiting for the host to start a rematch…</span>}
          <button className="btn border-2 border-gray-300 text-gray-700" onClick={onClose}>
            View board
          </button>
        </div>
      </div>
    </Modal>
  );
}
