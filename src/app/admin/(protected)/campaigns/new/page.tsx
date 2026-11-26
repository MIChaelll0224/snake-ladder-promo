import CampaignEditor from "@/components/admin/CampaignEditor";
import { defaultCampaign } from "@/lib/defaults";

export default function NewCampaign() {
  const c = defaultCampaign({ status: "draft", slug: `promo-${Date.now().toString(36).slice(-5)}`, name: "New Snake & Ladder Promo" });
  return <CampaignEditor initial={c} isNew />;
}
