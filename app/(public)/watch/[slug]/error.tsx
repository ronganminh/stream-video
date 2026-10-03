"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function WatchError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load this video"
      body="Try loading the watch page again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
