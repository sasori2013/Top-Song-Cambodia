import { Exo, Inter, Outfit } from "next/font/google";
import "./globals.css";
import VortexWrapper from "../components/VortexWrapper";

const exo = Exo({
  variable: "--font-exo",
  subsets: ["latin"],
  weight: ["200", "400", "700", "900"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"],
  preload: false,
});

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HEAT | AI Driven Cambodia Music Index",
  description: "Heat ranking of Cambodia music, powered by AI analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${exo.variable} ${inter.variable} ${outfit.variable} antialiased`}
      >
        <VortexWrapper />
        {children}
      </body>
    </html>
  );
}
