import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { publicCategoryExists } from "@/lib/data";

type Params = Promise<{ slug: string }>;

// Unknown (or empty) categorys answer 404, not 200. The layout renders before
// anything is sent; a notFound() from inside a loading.tsx boundary would
// come after the loading shell went out with status 200. Pages past the end
// are handled by the views (the p/ and filter routes have no loading.tsx).
export default async function CategoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  if (!(await publicCategoryExists((await params).slug))) notFound();
  return children;
}
