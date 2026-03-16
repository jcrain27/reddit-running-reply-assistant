"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DismissCandidateButton({
  candidateId,
  className = "button-ghost"
}: {
  candidateId: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDismiss() {
    setLoading(true);

    await fetch(`/api/candidates/${candidateId}/dismiss`, {
      method: "POST"
    });

    setLoading(false);
    router.refresh();
  }

  return (
    <button type="button" className={className} onClick={handleDismiss} disabled={loading}>
      {loading ? "Dismissing..." : "Dismiss"}
    </button>
  );
}
