import { redirect } from "next/navigation";
import RoomClient from "@/components/RoomClient";
import { isAdmin } from "@/lib/server/security";

export const dynamic = "force-dynamic";

/** Organizer / projector screen: big QR in the lobby, every board on screen, game controls. */
export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await isAdmin())) redirect(`/admin/login?next=/host/${code}`);
  return <RoomClient code={code.toUpperCase().replace(/[^A-Z0-9]/g, "")} mode="admin" />;
}
