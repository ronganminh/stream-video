"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function TagError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load this tag"
      body="Try loading the tag again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
