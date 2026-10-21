"use client";

import { useFormStatus } from "react-dom";

// Bulk approval is a plain form post that re-renders the queue; lock the
// button while it runs so a second click can't resubmit.
export function BulkApproveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={disabled || pending}>
      {pending ? "Approving…" : "Approve selected"}
    </button>
  );
}
