import type { NextConfig } from "next";

import { listRewrites } from "./lib/isr/listRoutes";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // beforeFiles: /latest etc. are real pages, so these must run before the
    // filesystem match. See lib/isr/listRoutes for why they live here.
    return { beforeFiles: listRewrites(), afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
