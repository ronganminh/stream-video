"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function CategoryError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load this category"
      body="Try loading the category again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
