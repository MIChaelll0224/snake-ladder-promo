import { notFound } from "next/navigation";
import CampaignEditor from "@/components/admin/CampaignEditor";
import { getStore } from "@/lib/store";

export default async function EditCampaign({ params }: { params: Promise<{ id: string }> }) {
  const c = await getStore().getCampaign((await params).id);
  if (!c) notFound();
  return <CampaignEditor initial={c} />;
}
