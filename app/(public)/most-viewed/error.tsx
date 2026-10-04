"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function MostViewedError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load most viewed videos"
      body="Try loading the list again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
