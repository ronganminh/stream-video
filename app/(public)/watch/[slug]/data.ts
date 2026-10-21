import { cache } from "react";

import { getWatch } from "@/lib/data";

// The layout, generateMetadata and the page share one lookup per request.
export const loadWatch = cache(getWatch);
