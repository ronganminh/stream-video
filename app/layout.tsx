/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

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

export const metadata: Metadata = {
  title: "GayVideo.fun",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={materialSymbolsHref} />
      </head>
      <body>{children}</body>
    </html>
  );
}
