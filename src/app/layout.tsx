import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/assets";
import { baseOpenGraph, SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata";
import "./globals.css";

/*
  Two faces, doing two jobs.

  Bricolage Grotesque for everything editorial — it's a variable grotesque with
  genuine oddness in its widths, and the name is apt for a collection assembled
  out of whatever was lying around.

  JetBrains Mono for every piece of real bucket data: object paths, byte counts,
  timestamps, counts. Metadata is set in mono because that is what it actually is.
*/
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["400", "500"],
});

// The share image lives alongside this file as opengraph-image.tsx, and the
// icons as icon.png / apple-icon.png; Next injects all three automatically.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "entertainment",
  openGraph: {
    ...baseOpenGraph,
    type: "website",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  appleWebApp: { title: SITE_NAME, statusBarStyle: "black-translucent" },
  // Byte counts and timestamps are all over the page; stop iOS Safari from
  // turning digit runs into tel: links.
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#14110f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
