import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", weight: ["500", "600", "700"] });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  title: "Snake & Ladder Promo",
  description: "Play our online Snake & Ladder promo game with up to 10 friends and win prizes!",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e1b4b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-dvh bg-[#1e1b4b] text-white antialiased">{children}</body>
    </html>
  );
}
