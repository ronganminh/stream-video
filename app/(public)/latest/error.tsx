"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function LatestError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load latest videos"
      body="Try loading the Latest list again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
