import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/security";
import { getStore } from "@/lib/store";
import { LogoutButton } from "@/components/admin/AdminActions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const kind = getStore().kind;
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-600 text-white">🎲</span> Promo Admin
          </Link>
          <nav className="flex gap-3 text-sm font-semibold text-slate-600">
            <Link href="/admin">Campaigns</Link>
            <Link href="/admin/campaigns/new">New campaign</Link>
            <Link href="/" target="_blank">
              View site ↗
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${kind === "supabase" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
              {kind === "supabase" ? "Supabase" : "Local memory store"}
            </span>
            <LogoutButton />
          </div>
        </div>
        {kind === "memory" && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
            Running on the local in-memory store (data saved to .data/dev-db.json). Add Supabase keys to .env.local before deploying to Vercel.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
