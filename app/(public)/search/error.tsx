"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Button } from "@/components/primitives";

export default function SearchError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Couldn’t load search results"
      body="Try this search again. Your query and filters will stay in the URL."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
