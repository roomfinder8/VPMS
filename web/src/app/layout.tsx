import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

// The interface is English, but visitor and company names are often typed in Thai,
// so the font still needs Thai coverage. Noto Sans Thai ships both scripts.
const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Visitor Parking Management — ETTP Unit",
  description:
    "Visitor log and daily parking validation report for the ETTP Unit (VPMS)",
};

export const viewport: Viewport = {
  // Stops iOS from zooming in when an input is focused, while still allowing pinch zoom.
  initialScale: 1,
  width: "device-width",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${notoThai.variable} h-full antialiased`}>
      <body className="font-sans min-h-full flex flex-col">{children}</body>
    </html>
  );
}
