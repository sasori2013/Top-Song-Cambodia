import { Exo, Inter } from "next/font/google";
import "./globals.css";

const exo = Exo({
  variable: "--font-exo",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HEAT | AI Driven Cambodia Music Analysis",
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
        className={`${exo.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
