import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { loadWatch } from "./data";

type Params = Promise<{ slug: string }>;

// An unknown slug must answer 404, not 200. The page sits under this
// segment's loading.tsx, so a notFound() from the page lands after the
// loading shell has been sent with status 200. The layout renders outside
// that boundary, before anything is sent. (Removed/blocked videos never get
// here: middleware answers 410.)
export default async function WatchLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { slug } = await params;
  if (!(await loadWatch(slug))) notFound();
  return children;
}
