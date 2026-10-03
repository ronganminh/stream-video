"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function CategoriesError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Couldn’t load categories"
      body="Try loading the category browser again."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
