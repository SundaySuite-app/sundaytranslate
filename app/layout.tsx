import type { Metadata, Viewport } from "next";
import { Playfair_Display, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Suite brand fonts.
const display = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});
const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SundayTranslate — live oversettelse i øret",
  description:
    "Live tolking og lytteanlegg for menigheten. Tolken leser inn oversettelsen; du hører den på din egen telefon med ørepropper. Ingen app å installere.",
  applicationName: "SundayTranslate",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SundayTranslate" },
};

export const viewport: Viewport = {
  themeColor: "#0e1418",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="no" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
