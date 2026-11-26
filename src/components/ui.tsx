"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Cta, PublicCampaign } from "@/lib/types";
import { ctaHref } from "@/lib/client/api";

export function themeStyle(c: Pick<PublicCampaign, "branding">): React.CSSProperties {
  const b = c.branding;
  return {
    ["--brand-primary" as string]: b.primary,
    ["--brand-secondary" as string]: b.secondary,
    ["--brand-accent" as string]: b.accent,
    ["--brand-bg" as string]: b.background,
    ...(b.backgroundImageUrl ? { backgroundImage: `linear-gradient(rgb(0 0 0 / .45), rgb(0 0 0 / .55)), url("${b.backgroundImageUrl}")` } : {}),
  };
}

export function BrandShell({ campaign, children }: { campaign: Pick<PublicCampaign, "branding">; children: React.ReactNode }) {
  return (
    <div className={`brand-bg min-h-dvh ${campaign.branding.backgroundImageUrl ? "brand-bg-image" : ""}`} style={themeStyle(campaign)}>
      {children}
    </div>
  );
}

export function Logo({ campaign, size = 40 }: { campaign: Pick<PublicCampaign, "branding" | "businessName">; size?: number }) {
  if (campaign.branding.logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={campaign.branding.logoUrl} alt={campaign.businessName} style={{ height: size }} className="w-auto object-contain" />;
  return (
    <span className="grid place-items-center rounded-xl bg-[var(--brand-secondary)] font-display text-[#1f1300] shadow" style={{ width: size, height: size, fontSize: size * 0.55 }}>
      🎲
    </span>
  );
}

export function CtaButtons({
  campaign,
  place,
  roomCode,
  playerId,
  className = "",
}: {
  campaign: PublicCampaign;
  place: Cta["showOn"][number];
  roomCode?: string;
  playerId?: string | null;
  className?: string;
}) {
  const ctas = campaign.ctas.filter((c) => c.showOn.includes(place));
  if (!ctas.length) return null;
  return (
    <div className={`flex flex-wrap justify-center gap-3 ${className}`}>
      {ctas.map((c) => (
        <a key={c.id} href={ctaHref(campaign.id, c.id, roomCode, playerId)} target="_blank" rel="noopener noreferrer" className={`btn btn-${c.style} text-sm`}>
          {c.label}
        </a>
      ))}
    </div>
  );
}

export function Sponsors({ campaign }: { campaign: PublicCampaign }) {
  const s = campaign.branding.sponsorLogos;
  if (!s.length) return null;
  return (
    <div className="mt-6 text-center">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/50">Our partners</div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {s.map((x, i) => {
          const inner = x.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={x.logoUrl} alt={x.name} className="h-10 w-auto rounded bg-white/90 object-contain p-1" />
          ) : (
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{x.name}</span>
          );
          return x.url ? (
            <a key={i} href={x.url} target="_blank" rel="noopener noreferrer sponsored">
              {inner}
            </a>
          ) : (
            <span key={i}>{inner}</span>
          );
        })}
      </div>
    </div>
  );
}

export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc(""));
  }, [text, size]);
  if (!src) return <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-white/20" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR code to join" width={size} height={size} className="rounded-xl bg-white p-2" />;
}

export function Modal({ open, onClose, children, wide = false }: { open: boolean; onClose?: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal>
      <div
        className={`float-in max-h-[92dvh] w-full overflow-y-auto rounded-3xl bg-white p-6 text-gray-900 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function useIsDesktop(query = "(min-width: 1024px)") {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className || "btn btn-outline px-4 py-2 text-sm"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
