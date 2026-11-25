import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { loadWatch } from "./data";

type Params = Promise<{ slug: string }>;

// An unknown slug must answer 404, not 200. The page sits under this
// segment's loading.tsx, so a notFound() from the page lands after the
// loading shell has been sent with status 200. The layout renders outside
// that boundary, before anything is sent. Removed/blocked videos normally
// get a 410 from middleware; if that check fails, they end here as a 404
// too, never as a notFound() thrown after the stream has started (which
// logs "Cannot append headers after they are sent to the client").
export default async function WatchLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { slug } = await params;
  const result = await loadWatch(slug);
  const status = result?.video.availability;
  if (!result || status === "REMOVED" || status === "BLOCKED") notFound();
  return children;
}
