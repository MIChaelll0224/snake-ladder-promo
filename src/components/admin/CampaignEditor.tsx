"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BoardLayout, Campaign, Cta, Milestone, RegistrationField } from "@/lib/types";
import { api } from "@/lib/client/api";
import { generateBoard } from "@/lib/engine";
import { Board } from "@/components/Board";

const TABS = ["General", "Branding", "Content", "Game", "Board", "Registration & privacy", "CTAs", "Milestones", "Prizes & coupons"] as const;
type Tab = (typeof TABS)[number];

const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
const inp = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-violet-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value.length === 7 ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300" />
      <input className={inp} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function CampaignEditor({ initial, isNew = false }: { initial: Campaign; isNew?: boolean }) {
  const [c, setC] = useState<Campaign>(initial);
  const [tab, setTab] = useState<Tab>("General");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [layoutsText, setLayoutsText] = useState(() => (initial.gameConfig.customLayouts.length ? JSON.stringify(initial.gameConfig.customLayouts, null, 1) : ""));
  const [layoutsErr, setLayoutsErr] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState(0);

  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setC((p) => ({ ...p, [k]: v }));
  const setIn = <K extends "branding" | "content" | "gameConfig" | "registration" | "coupon">(k: K, patch: Partial<Campaign[K]>) =>
    setC((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  const previewBoard: BoardLayout = useMemo(() => {
    if (c.gameConfig.customLayouts.length) return c.gameConfig.customLayouts[previewSeed % c.gameConfig.customLayouts.length];
    return generateBoard(c.gameConfig.snakesCount, c.gameConfig.laddersCount, (m) => Math.floor(Math.random() * m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.gameConfig.snakesCount, c.gameConfig.laddersCount, c.gameConfig.customLayouts, previewSeed]);

  const applyLayouts = (text: string) => {
    setLayoutsText(text);
    if (!text.trim()) {
      setLayoutsErr(null);
      setIn("gameConfig", { customLayouts: [] });
      return;
    }
    try {
      const v = JSON.parse(text);
      const list = Array.isArray(v) ? v : [v];
      for (const l of list) if (!Array.isArray(l.snakes) || !Array.isArray(l.ladders)) throw new Error("Each layout needs snakes and ladders arrays");
      setLayoutsErr(null);
      setIn("gameConfig", { customLayouts: list });
    } catch (e) {
      setLayoutsErr((e as Error).message);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const saved = await api<Campaign>(isNew ? "/api/admin/campaigns" : `/api/admin/campaigns/${c.id}`, { method: isNew ? "POST" : "PUT", body: c });
      if (isNew) {
        window.location.href = `/admin/campaigns/${saved.id}`;
        return;
      }
      setC(saved);
      setMsg({ ok: true, text: "Saved ✓" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const g = c.gameConfig;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Link href={isNew ? "/admin" : `/admin/campaigns/${c.id}`} className="text-sm text-slate-500 hover:underline">
            ← Back
          </Link>
          <h1 className="font-display text-3xl font-bold">{isNew ? "New campaign" : `Edit: ${c.name}`}</h1>
        </div>
        {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>}
        {!isNew && (
          <a href={`/c/${c.slug}`} target="_blank" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">
            Preview ↗
          </a>
        )}
        <button onClick={save} disabled={saving} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-violet-700 disabled:opacity-50">
          {saving ? "Saving…" : isNew ? "Create campaign" : "Save changes"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold ${tab === t ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-white"}`}>
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {tab === "General" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign name (internal)">
                <input className={inp} value={c.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Business / brand name">
                <input className={inp} value={c.businessName} onChange={(e) => set("businessName", e.target.value)} />
              </Field>
              <Field label="URL slug" hint={`Players open /c/${c.slug}`}>
                <input className={inp} value={c.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
              </Field>
              <Field label="Status" hint="Only ACTIVE campaigns inside their dates accept players.">
                <select className={inp} value={c.status} onChange={(e) => set("status", e.target.value as Campaign["status"])}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived (ended)</option>
                </select>
              </Field>
              <Field label="Campaign starts" hint="Leave empty to start immediately">
                <input type="datetime-local" className={inp} value={toLocal(c.startsAt)} onChange={(e) => set("startsAt", fromLocal(e.target.value))} />
              </Field>
              <Field label="Campaign ends" hint="Leave empty for no end date">
                <input type="datetime-local" className={inp} value={toLocal(c.endsAt)} onChange={(e) => set("endsAt", fromLocal(e.target.value))} />
              </Field>
              <Field label="Data retention (days)" hint="Registration details are anonymised after this many days.">
                <input type="number" min={1} max={3650} className={inp} value={c.retentionDays} onChange={(e) => set("retentionDays", Number(e.target.value))} />
              </Field>
            </div>
          )}

          {tab === "Branding" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Logo URL" hint="PNG/SVG link (e.g. from your website or Supabase Storage)">
                <input className={inp} value={c.branding.logoUrl} onChange={(e) => setIn("branding", { logoUrl: e.target.value })} placeholder="https://…/logo.png" />
              </Field>
              <Field label="Banner text">
                <input className={inp} value={c.branding.bannerText} onChange={(e) => setIn("branding", { bannerText: e.target.value })} />
              </Field>
              <Field label="Primary color">
                <ColorInput value={c.branding.primary} onChange={(v) => setIn("branding", { primary: v })} />
              </Field>
              <Field label="Secondary color">
                <ColorInput value={c.branding.secondary} onChange={(v) => setIn("branding", { secondary: v })} />
              </Field>
              <Field label="Accent color">
                <ColorInput value={c.branding.accent} onChange={(v) => setIn("branding", { accent: v })} />
              </Field>
              <Field label="Background color">
                <ColorInput value={c.branding.background} onChange={(v) => setIn("branding", { background: v })} />
              </Field>
              <Field label="Background image URL (optional)">
                <input className={inp} value={c.branding.backgroundImageUrl} onChange={(e) => setIn("branding", { backgroundImageUrl: e.target.value })} />
              </Field>
              <Field label="Promo banner image URL (optional)" hint="Shown at the top of the landing page">
                <input className={inp} value={c.branding.bannerImageUrl} onChange={(e) => setIn("branding", { bannerImageUrl: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <div className="mb-2 text-sm font-semibold text-slate-700">Sponsors / partner logos</div>
                {c.branding.sponsorLogos.map((s, i) => (
                  <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_2fr_2fr_auto]">
                    <input className={inp} placeholder="Name" value={s.name} onChange={(e) => setIn("branding", { sponsorLogos: c.branding.sponsorLogos.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <input className={inp} placeholder="Logo URL" value={s.logoUrl} onChange={(e) => setIn("branding", { sponsorLogos: c.branding.sponsorLogos.map((x, j) => (j === i ? { ...x, logoUrl: e.target.value } : x)) })} />
                    <input className={inp} placeholder="Website" value={s.url} onChange={(e) => setIn("branding", { sponsorLogos: c.branding.sponsorLogos.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    <button className="rounded-xl px-3 text-red-600 hover:bg-red-50" onClick={() => setIn("branding", { sponsorLogos: c.branding.sponsorLogos.filter((_, j) => j !== i) })}>
                      ✕
                    </button>
                  </div>
                ))}
                <button className="text-sm font-semibold text-violet-700" onClick={() => setIn("branding", { sponsorLogos: [...c.branding.sponsorLogos, { name: "", logoUrl: "", url: "" }] })}>
                  ＋ Add sponsor
                </button>
              </div>
              <div className="rounded-2xl p-5 text-white sm:col-span-2" style={{ background: c.branding.background }}>
                <div className="text-xs uppercase tracking-widest opacity-70">Preview</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full px-4 py-2 font-bold" style={{ background: c.branding.primary }}>
                    Primary
                  </span>
                  <span className="rounded-full px-4 py-2 font-bold text-black" style={{ background: c.branding.secondary }}>
                    Secondary
                  </span>
                  <span className="rounded-full px-4 py-2 font-bold" style={{ background: c.branding.accent }}>
                    Accent
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === "Content" && (
            <div className="grid gap-4">
              <Field label="Headline">
                <input className={inp} value={c.content.headline} onChange={(e) => setIn("content", { headline: e.target.value })} />
              </Field>
              <Field label="Tagline">
                <input className={inp} value={c.content.tagline} onChange={(e) => setIn("content", { tagline: e.target.value })} />
              </Field>
              <Field label="Welcome / promo message">
                <textarea rows={3} className={inp} value={c.content.welcomeMessage} onChange={(e) => setIn("content", { welcomeMessage: e.target.value })} />
              </Field>
              <Field label="Mechanics (one step per line)">
                <textarea rows={5} className={inp} value={c.content.mechanics.join("\n")} onChange={(e) => setIn("content", { mechanics: e.target.value.split("\n") })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Winner message">
                  <textarea rows={2} className={inp} value={c.content.winnerMessage} onChange={(e) => setIn("content", { winnerMessage: e.target.value })} />
                </Field>
                <Field label="Message for everyone else">
                  <textarea rows={2} className={inp} value={c.content.loserMessage} onChange={(e) => setIn("content", { loserMessage: e.target.value })} />
                </Field>
              </div>
            </div>
          )}

          {tab === "Game" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Max players per room" hint="2 – 10">
                <input type="number" min={2} max={10} className={inp} value={g.maxPlayers} onChange={(e) => setIn("gameConfig", { maxPlayers: Number(e.target.value) })} />
              </Field>
              <Field label="Min players to start">
                <input type="number" min={1} max={10} className={inp} value={g.minPlayers} onChange={(e) => setIn("gameConfig", { minPlayers: Number(e.target.value) })} />
              </Field>
              <Field label="Seconds per turn" hint="Default 20. When time runs out the computer rolls for the player (5 – 120).">
                <input type="number" min={5} max={120} className={inp} value={g.turnSeconds} onChange={(e) => setIn("gameConfig", { turnSeconds: Number(e.target.value) })} />
              </Field>
              <Field label="Countdown before the first turn (s)">
                <input type="number" min={0} max={30} className={inp} value={g.startCountdownSec} onChange={(e) => setIn("gameConfig", { startCountdownSec: Number(e.target.value) })} />
              </Field>
              <Field label="Dice sides" hint="6 = classic dice. Higher = faster games.">
                <input type="number" min={4} max={12} className={inp} value={g.diceMax} onChange={(e) => setIn("gameConfig", { diceMax: Number(e.target.value) })} />
              </Field>
              <Field label="Winning places" hint="1 = first to 100 wins and the game ends. 3 = play until 1st–3rd are decided.">
                <input type="number" min={1} max={10} className={inp} value={g.winnersCount} onChange={(e) => setIn("gameConfig", { winnersCount: Number(e.target.value) })} />
              </Field>
              <div className="space-y-3 sm:col-span-2">
                <Field label="Rolling past 100">
                  <select className={inp} value={g.finishRule} onChange={(e) => setIn("gameConfig", { finishRule: e.target.value as typeof g.finishRule })}>
                    <option value="bounce">Bounce back — 98 + 4 → 99, 100, 99, 98</option>
                    <option value="exact">Stay put — need the exact number</option>
                    <option value="any">Finish anyway — any roll past 100 wins</option>
                  </select>
                </Field>
                <Toggle checked={g.extraTurnOnSix} onChange={(v) => setIn("gameConfig", { extraTurnOnSix: v })} label={`Rolling a ${g.diceMax} gives another turn`} />
                <Toggle checked={g.allowSpectators} onChange={(v) => setIn("gameConfig", { allowSpectators: v })} label="Allow spectators (watch a game without playing)" />
                <Toggle checked={g.allowPlayerHosting} onChange={(v) => setIn("gameConfig", { allowPlayerHosting: v })} label="Players can host their own rooms from the landing page" />
              </div>
            </div>
          )}

          {tab === "Board" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Everyone plays on <b>one shared board</b>. A new random board is made each round using the counts below — or add your own layouts and one of them is used each round.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Snakes">
                    <input type="number" min={0} max={14} className={inp} value={g.snakesCount} onChange={(e) => setIn("gameConfig", { snakesCount: Number(e.target.value) })} />
                  </Field>
                  <Field label="Ladders">
                    <input type="number" min={0} max={14} className={inp} value={g.laddersCount} onChange={(e) => setIn("gameConfig", { laddersCount: Number(e.target.value) })} />
                  </Field>
                </div>
                <Field
                  label="Custom layouts (optional, JSON)"
                  hint='List of boards: [{"snakes":[[head,tail],…],"ladders":[[bottom,top],…]}, …]. Squares 2–99, no two shortcuts on the same square. Leave empty for a random board each round.'
                >
                  <textarea rows={8} className={`${inp} font-mono text-xs`} value={layoutsText} onChange={(e) => applyLayouts(e.target.value)} placeholder='[{"snakes":[[97,78],[62,19]],"ladders":[[4,25],[50,91]]}]' />
                </Field>
                {layoutsErr && <p className="text-sm text-red-600">{layoutsErr}</p>}
                <button
                  className="text-sm font-semibold text-violet-700"
                  onClick={() => {
                    const l = generateBoard(g.snakesCount, g.laddersCount, (m) => Math.floor(Math.random() * m));
                    applyLayouts(JSON.stringify([...g.customLayouts, l], null, 1));
                  }}
                >
                  ＋ Add a random layout to the list (then edit it)
                </button>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                  Preview {g.customLayouts.length ? `(layout ${(previewSeed % g.customLayouts.length) + 1}/${g.customLayouts.length})` : "(random)"}
                  <button className="text-violet-700" onClick={() => setPreviewSeed((s) => s + 1)}>
                    ↻ Next
                  </button>
                </div>
                <Board layout={previewBoard} pawns={[]} animKey={0} />
              </div>
            </div>
          )}

          {tab === "Registration & privacy" && (
            <div className="space-y-5">
              <Toggle checked={c.registration.enabled} onChange={(v) => setIn("registration", { enabled: v })} label="Ask players to register (fields below) before joining" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1">Key</th>
                      <th>Label</th>
                      <th>Type</th>
                      <th>Options (select)</th>
                      <th>Enabled</th>
                      <th>Required</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.registration.fields.map((f, i) => {
                      const upd = (patch: Partial<RegistrationField>) => setIn("registration", { fields: c.registration.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                      const builtin = ["name", "email", "phone"].includes(f.key);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 pr-2">
                            <input className={`${inp} w-28 font-mono`} value={f.key} disabled={builtin} onChange={(e) => upd({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                          </td>
                          <td className="pr-2">
                            <input className={inp} value={f.label} onChange={(e) => upd({ label: e.target.value })} />
                          </td>
                          <td className="pr-2">
                            <select className={inp} value={f.type} disabled={builtin} onChange={(e) => upd({ type: e.target.value as RegistrationField["type"] })}>
                              <option value="text">Text</option>
                              <option value="email">Email</option>
                              <option value="tel">Phone</option>
                              <option value="select">Dropdown</option>
                            </select>
                          </td>
                          <td className="pr-2">
                            <input className={inp} disabled={f.type !== "select"} value={(f.options ?? []).join(", ")} onChange={(e) => upd({ options: e.target.value.split(",").map((s) => s.trim()) })} />
                          </td>
                          <td className="text-center">
                            <input type="checkbox" checked={f.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
                          </td>
                          <td className="text-center">
                            <input type="checkbox" checked={f.required} onChange={(e) => upd({ required: e.target.checked })} />
                          </td>
                          <td>
                            {!builtin && (
                              <button className="px-2 text-red-600" onClick={() => setIn("registration", { fields: c.registration.fields.filter((_, j) => j !== i) })}>
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                className="text-sm font-semibold text-violet-700"
                onClick={() =>
                  setIn("registration", { fields: [...c.registration.fields, { key: `field_${c.registration.fields.length + 1}`, label: "New field", type: "text", enabled: true, required: false }] })
                }
              >
                ＋ Add custom field
              </button>
              <hr />
              <Toggle checked={c.registration.consentEnabled} onChange={(v) => setIn("registration", { consentEnabled: v })} label="Show optional marketing consent checkbox (separate from joining)" />
              <Field label="Consent checkbox text">
                <textarea rows={2} className={inp} value={c.content.consentText} onChange={(e) => setIn("content", { consentText: e.target.value })} />
              </Field>
              <Field label="Privacy notice" hint={`Shown at /privacy/${c.slug}`}>
                <textarea rows={6} className={inp} value={c.content.privacyNotice} onChange={(e) => setIn("content", { privacyNotice: e.target.value })} />
              </Field>
            </div>
          )}

          {tab === "CTAs" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Buttons like “Visit our Facebook page” or “Claim your reward”. Every click is tracked before redirecting.</p>
              {c.ctas.map((x, i) => {
                const upd = (patch: Partial<Cta>) => set("ctas", c.ctas.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                return (
                  <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[120px_1fr_2fr_130px_auto]">
                    <input className={`${inp} font-mono`} value={x.id} onChange={(e) => upd({ id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} title="ID" />
                    <input className={inp} value={x.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Label" />
                    <input className={inp} value={x.url} onChange={(e) => upd({ url: e.target.value })} placeholder="https://" />
                    <select className={inp} value={x.style} onChange={(e) => upd({ style: e.target.value as Cta["style"] })}>
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="outline">Outline</option>
                    </select>
                    <button className="px-2 text-red-600" onClick={() => set("ctas", c.ctas.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                    <div className="flex flex-wrap gap-4 text-sm sm:col-span-5">
                      Show on:
                      {(["landing", "lobby", "game", "finish"] as const).map((p) => (
                        <label key={p} className="flex items-center gap-1">
                          <input type="checkbox" checked={x.showOn.includes(p)} onChange={(e) => upd({ showOn: e.target.checked ? [...x.showOn, p] : x.showOn.filter((s) => s !== p) })} />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button
                className="text-sm font-semibold text-violet-700"
                onClick={() => set("ctas", [...c.ctas, { id: `cta${c.ctas.length + 1}`, label: "Follow Us", url: "https://", style: "primary", showOn: ["landing", "finish"] }])}
              >
                ＋ Add CTA button
              </button>
            </div>
          )}

          {tab === "Milestones" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Promo pop-ups shown to a player when they reach a square, climb a ladder, hit a snake or finish (once per round).</p>
              {c.milestones.map((m, i) => {
                const upd = (patch: Partial<Milestone>) => set("milestones", c.milestones.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                return (
                  <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[140px_90px_1fr_auto]">
                    <select className={inp} value={m.trigger} onChange={(e) => upd({ trigger: e.target.value as Milestone["trigger"] })}>
                      <option value="square">Reach square</option>
                      <option value="ladder">Climb a ladder</option>
                      <option value="snake">Hit a snake</option>
                      <option value="finish">Finish</option>
                    </select>
                    <input type="number" min={1} max={100} className={inp} disabled={m.trigger !== "square"} value={m.value ?? ""} onChange={(e) => upd({ value: Number(e.target.value) })} placeholder="Square" />
                    <input className={inp} value={m.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Title" />
                    <button className="px-2 text-red-600" onClick={() => set("milestones", c.milestones.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                    <textarea rows={2} className={`${inp} sm:col-span-3`} value={m.message} onChange={(e) => upd({ message: e.target.value })} placeholder="Message / reward" />
                    <select className={inp} value={m.ctaId ?? ""} onChange={(e) => upd({ ctaId: e.target.value || undefined })}>
                      <option value="">No button</option>
                      {c.ctas.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              <button
                className="text-sm font-semibold text-violet-700"
                onClick={() => set("milestones", [...c.milestones, { id: `m${Date.now().toString(36)}`, trigger: "square", value: 75, title: "Almost there!", message: "" }])}
              >
                ＋ Add milestone pop-up
              </button>
            </div>
          )}

          {tab === "Prizes & coupons" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prize title">
                <input className={inp} value={c.content.prizeTitle} onChange={(e) => setIn("content", { prizeTitle: e.target.value })} />
              </Field>
              <Field label="Prizes by place (one per line: 1st, 2nd, 3rd…)">
                <textarea rows={3} className={inp} value={c.coupon.prizeByRank.join("\n")} onChange={(e) => setIn("coupon", { prizeByRank: e.target.value.split("\n") })} />
              </Field>
              <Field label="Prize details / how to claim">
                <textarea rows={3} className={inp} value={c.content.prizeDetails} onChange={(e) => setIn("content", { prizeDetails: e.target.value })} />
              </Field>
              <div className="space-y-3">
                <Toggle checked={c.coupon.enabled} onChange={(v) => setIn("coupon", { enabled: v })} label="Give winners a unique coupon code" />
                <Field label="Coupon prefix" hint="Codes look like PREFIX-7KQ2MX">
                  <input className={inp} value={c.coupon.prefix} onChange={(e) => setIn("coupon", { prefix: e.target.value.toUpperCase() })} />
                </Field>
                <Toggle checked={!c.coupon.winnerOnly} onChange={(v) => setIn("coupon", { winnerOnly: !v })} label="Also give everyone else a thank-you code" />
                <Field label="Thank-you code for non-winners">
                  <input className={inp} value={c.coupon.participationCode} onChange={(e) => setIn("coupon", { participationCode: e.target.value })} disabled={c.coupon.winnerOnly} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
