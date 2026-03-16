"use client";

import { PreferenceSignal } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CandidatePreferenceControls({
  candidateId,
  currentSignal,
  compact = false
}: {
  candidateId: string;
  currentSignal?: PreferenceSignal | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<PreferenceSignal | null>(null);

  async function handleSignal(signal: PreferenceSignal) {
    setLoading(signal);

    await fetch(`/api/candidates/${candidateId}/preference`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ signal })
    });

    setLoading(null);
    router.refresh();
  }

  const moreActive = currentSignal === PreferenceSignal.MORE;
  const lessActive = currentSignal === PreferenceSignal.LESS;
  const moreLabel = compact ? "More" : "More like this";
  const lessLabel = compact ? "Less" : "Less like this";

  return (
    <div className="toolbar">
      <button
        type="button"
        className={moreActive ? "button" : "button-ghost"}
        onClick={() => handleSignal(PreferenceSignal.MORE)}
        disabled={loading !== null}
      >
        {loading === PreferenceSignal.MORE ? "Saving..." : moreLabel}
      </button>
      <button
        type="button"
        className={lessActive ? "button-danger" : "button-ghost"}
        onClick={() => handleSignal(PreferenceSignal.LESS)}
        disabled={loading !== null}
      >
        {loading === PreferenceSignal.LESS ? "Saving..." : lessLabel}
      </button>
    </div>
  );
}
