"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CandidateRowActions({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function handleAction(action: "regenerate" | "archive" | "skip") {
    setBusyAction(action);

    await fetch(`/api/candidates/${candidateId}/${action}`, {
      method: "POST"
    });

    setBusyAction(null);
    router.refresh();
  }

  return (
    <div className="toolbar">
      <Link href={`/candidates/${candidateId}`} className="button-ghost">
        View
      </Link>
      <button
        type="button"
        className="button-ghost"
        onClick={() => handleAction("regenerate")}
        disabled={busyAction !== null}
      >
        {busyAction === "regenerate" ? "Working..." : "Regenerate"}
      </button>
      <button
        type="button"
        className="button-ghost"
        onClick={() => handleAction("skip")}
        disabled={busyAction !== null}
      >
        Skip
      </button>
      <button
        type="button"
        className="button-danger"
        onClick={() => handleAction("archive")}
        disabled={busyAction !== null}
      >
        Archive
      </button>
    </div>
  );
}
