import Link from "next/link";
import Landing from "@/components/Landing";
import { getActiveCampaign, publicCampaign } from "@/lib/server/game";

export const dynamic = "force-dynamic";

export default async function Home() {
  const campaign = await getActiveCampaign();
  if (!campaign)
    return (
      <div className="brand-bg grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="text-6xl">🎲</div>
          <h1 className="mt-3 font-display text-3xl font-bold">No promo is running yet</h1>
          <Link href="/admin" className="btn btn-primary mt-5">
            Open admin dashboard
          </Link>
        </div>
      </div>
    );
  return <Landing campaign={publicCampaign(campaign)} />;
}
