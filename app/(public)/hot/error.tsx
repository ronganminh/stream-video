"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function HotError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load hot videos"
      body="Try loading the Hot list again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
