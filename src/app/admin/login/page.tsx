"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";

export default function AdminLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="brand-bg grid min-h-dvh place-items-center p-4">
      <form
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-gray-900 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await api("/api/admin/login", { body: { password: pw } });
            const next = new URLSearchParams(window.location.search).get("next");
            window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Login failed");
            setBusy(false);
          }
        }}
      >
        <div className="text-4xl">🎲</div>
        <h1 className="mt-2 font-display text-2xl font-bold">Promo admin</h1>
        <p className="text-sm text-gray-500">Sign in to manage campaigns, rooms and winners.</p>
        <input type="password" className="input mt-4 border-gray-300" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
        {err && <p className="mt-2 text-sm font-semibold text-red-600">{err}</p>}
        <button className="btn btn-primary mt-4 w-full" disabled={busy || !pw}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
