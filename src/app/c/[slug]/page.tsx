import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Landing from "@/components/Landing";
import { publicCampaign } from "@/lib/server/game";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const c = await getStore().getCampaignBySlug((await params).slug);
  return c ? { title: `${c.content.headline} · ${c.businessName}`, description: c.content.tagline } : {};
}

export default async function CampaignPage({ params }: P) {
  const c = await getStore().getCampaignBySlug((await params).slug);
  if (!c || c.status === "draft") notFound();
  return <Landing campaign={publicCampaign(c)} />;
}
