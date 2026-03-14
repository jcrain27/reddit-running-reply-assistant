"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunScanButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/scan/run", {
      method: "POST"
    });

    const data = (await response.json().catch(() => null)) as
      | { error?: string; draftedCount?: number; candidateCount?: number }
      | null;

    if (!response.ok) {
      setMessage(data?.error || "Scan failed.");
      setLoading(false);
      return;
    }

    setMessage(
      `Scan completed. ${data?.candidateCount ?? 0} candidates, ${data?.draftedCount ?? 0} drafts.`
    );
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="split-list">
      <button type="button" className="button" onClick={handleRun} disabled={loading}>
        {loading ? "Running scan..." : "Run Scan Now"}
      </button>
      {message ? <div className="muted">{message}</div> : null}
    </div>
  );
}
