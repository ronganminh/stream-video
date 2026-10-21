/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { ageGateBootScript } from "@/lib/ageGate";
import { defaultMetadata } from "@/lib/seo/metadata";

import "../styles/tokens.css";
import "../styles/globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--gv-font",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--gv-font-mono",
});

const materialSymbolsHref =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0&display=block";

export const metadata: Metadata = defaultMetadata();

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The age-gate boot script may add an attribute to <html> before React
    // hydrates, so the attribute difference is expected.
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: ageGateBootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={materialSymbolsHref} />
      </head>
      <body>{children}</body>
    </html>
  );
}
