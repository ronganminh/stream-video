import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page not found | GayVideo.fun",
  robots: {
    index: false,
    follow: true,
  },
};

export default function UnmatchedRoutePage() {
  notFound();
}
