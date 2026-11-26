import RoomClient from "@/components/RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ watch?: string }> }) {
  const { code } = await params;
  const { watch } = await searchParams;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return <RoomClient key={`${clean}-${watch ? "w" : "p"}`} code={clean} mode={watch ? "spectator" : "player"} />;
}
