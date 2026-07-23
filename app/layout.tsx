import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASCEND — Solo Progress System",
  description: "Local-first sistem za lični napredak, questove, skillove i boss izazove.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
  openGraph: {
    title: "ASCEND — Solo Progress System",
    description: "Quests · Skills · XP · Ranks. Tvoj local-first sistem napretka.",
    type: "website",
    images: [{ url: "/og.png", width: 1730, height: 908, alt: "ASCEND Solo Progress System" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ASCEND — Solo Progress System",
    description: "Quests · Skills · XP · Ranks.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#070812",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sr">
      <body>{children}</body>
    </html>
  );
}
