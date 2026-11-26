import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandShell } from "@/components/ui";
import { publicCampaign } from "@/lib/server/game";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Privacy({ params }: { params: Promise<{ slug: string }> }) {
  const raw = await getStore().getCampaignBySlug((await params).slug);
  if (!raw) notFound();
  const c = publicCampaign(raw);
  return (
    <BrandShell campaign={c}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href={`/c/${c.slug}`} className="text-sm underline">
          ← Back to {c.content.headline}
        </Link>
        <div className="mt-4 rounded-3xl bg-white p-6 text-gray-800 shadow-xl sm:p-8">
          <h1 className="font-display text-3xl font-bold text-gray-900">Privacy notice</h1>
          <p className="mt-1 text-sm text-gray-500">
            {c.businessName} · {c.name}
          </p>
          <div className="mt-5 whitespace-pre-line leading-relaxed">{c.content.privacyNotice}</div>
          <h2 className="mt-6 font-display text-xl font-bold text-gray-900">What we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your nickname and chosen avatar (shown to other players in your room).</li>
            {c.registration.enabled &&
              c.registration.fields
                .filter((f) => f.enabled)
                .map((f) => (
                  <li key={f.key}>
                    {f.label} {f.required ? "(required)" : "(optional)"}
                  </li>
                ))}
            <li>Game results (positions, wins, prize codes) and clicks on promo buttons.</li>
          </ul>
          <h2 className="mt-6 font-display text-xl font-bold text-gray-900">Marketing consent</h2>
          <p className="mt-2">
            Marketing messages are only sent if you tick the consent box. It is optional and separate from joining the game. Each consent choice is recorded with
            the exact wording shown to you.
          </p>
          <h2 className="mt-6 font-display text-xl font-bold text-gray-900">Retention</h2>
          <p className="mt-2">Personal registration details are anonymised {raw.retentionDays} days after they were collected.</p>
        </div>
      </div>
    </BrandShell>
  );
}
