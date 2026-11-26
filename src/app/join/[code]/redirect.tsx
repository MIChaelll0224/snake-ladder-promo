"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getToken } from "@/lib/client/api";

/** Already joined this room on this device? Go straight back in (reconnect). */
export default function JoinRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    if (getToken(code)) router.replace(`/room/${code}`);
  }, [code, router]);
  return null;
}
