"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicCampaign } from "@/lib/types";
import { api, getDeviceId, setToken } from "@/lib/client/api";
import { unlockAudio } from "@/lib/client/sound";

/** Nickname + avatar + optional marketing registration. `code` = join that room, otherwise create a new room as host. */
export default function JoinForm({ campaign, code, submitLabel }: { campaign: PublicCampaign; code?: string; submitLabel?: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sl:profile") || "{}");
      if (saved.nickname) setNickname(saved.nickname);
    } catch {
      /* ignore */
    }
  }, []);

  const reg = campaign.registration;
  const regFields = reg.enabled ? reg.fields.filter((f) => f.enabled) : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const body = {
        nickname,
        deviceId: getDeviceId(),
        fields,
        consent: reg.enabled && reg.consentEnabled ? consent : undefined,
        campaign: campaign.slug,
      };
      const res = await api<{ playerId: string; token: string; code: string }>(code ? `/api/rooms/${code}/join` : "/api/rooms", { body });
      setToken(res.code, res.token);
      try {
        localStorage.setItem("sl:profile", JSON.stringify({ nickname }));
      } catch {
        /* ignore */
      }
      router.push(`/room/${res.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-bold" htmlFor="nick">
          Your name
        </label>
        <input id="nick" className="input text-center font-display text-2xl" maxLength={16} minLength={2} required value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Type your name" autoComplete="nickname" autoFocus />
      </div>
      {regFields.length > 0 && (
        <fieldset className="space-y-3 rounded-2xl bg-white/5 p-4">
          <legend className="px-1 text-sm font-bold">Register for the promo {regFields.every((f) => !f.required) && <span className="font-normal text-white/60">(optional)</span>}</legend>
          {regFields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm" htmlFor={`f-${f.key}`}>
                {f.label} {f.required && <span className="text-amber-300">*</span>}
              </label>
              {f.type === "select" && f.options?.length ? (
                <select id={`f-${f.key}`} className="input" required={f.required} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`f-${f.key}`}
                  className="input"
                  type={f.type === "select" ? "text" : f.type}
                  required={f.required}
                  maxLength={120}
                  value={fields[f.key] ?? ""}
                  autoComplete={f.type === "email" ? "email" : f.type === "tel" ? "tel" : f.key === "name" ? "name" : "off"}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </fieldset>
      )}

      {reg.enabled && reg.consentEnabled && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/5 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-secondary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{campaign.content.consentText}</span>
        </label>
      )}

      {error && <div className="rounded-xl bg-red-500/90 px-3 py-2 text-sm font-semibold">{error}</div>}

      <button className="btn btn-primary w-full py-4 text-lg" disabled={busy || nickname.trim().length < 2}>
        {busy ? "Joining…" : submitLabel ?? "Join game"}
      </button>
      <p className="text-center text-xs text-white/60">
        By playing you agree to the{" "}
        <Link href={`/privacy/${campaign.slug}`} className="underline" target="_blank">
          privacy notice
        </Link>
        . Marketing consent is optional and not required to play.
      </p>
    </form>
  );
}
