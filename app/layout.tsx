import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeAscend — Personal Progress System",
  description: "Quests, skills, XP, ranks, and focused personal progress — synchronized across your devices.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/weascend-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/weascend-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "WeAscend — Personal Progress System",
    description: "Quests · Skills · XP · Ranks. Your focused personal progress system.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "WeAscend Personal Progress System" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WeAscend — Personal Progress System",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
