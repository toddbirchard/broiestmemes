import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/assets";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Broiest Memes",
    template: "%s · Broiest Memes",
  },
  description:
    "A browsable archive of 1,900-odd memes, sorted into 112 categories and accumulated since 2019.",
  openGraph: {
    type: "website",
    siteName: "Broiest Memes",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
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
