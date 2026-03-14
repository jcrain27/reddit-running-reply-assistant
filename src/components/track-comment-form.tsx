"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TrackCommentForm(props: {
  endpoint: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [commentPermalink, setCommentPermalink] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit() {
    const permalink = commentPermalink.trim();
    if (!permalink) {
      setMessage("Paste the Reddit comment permalink first.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const response = await fetch(props.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        commentPermalink: permalink
      })
    });

    const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    setLoading(false);
    if (!response.ok) {
      setMessage(data?.error || "Tracking failed.");
      return;
    }

    setCommentPermalink("");
    setMessage(data?.message || "Comment tracking saved.");
    router.refresh();
  }

  return (
    <div className="panel">
      <div className="split-list">
        <div>
          <h2 className="page-title" style={{ fontSize: "1.25rem" }}>
            {props.title || "Track Your Live Comment"}
          </h2>
          <p className="page-copy">
            {props.description ||
              "After you post manually on Reddit, paste the permalink here so the app can watch for replies and draft natural follow-ups."}
          </p>
        </div>

        <div className="field">
          <label htmlFor="commentPermalink">Reddit comment permalink</label>
          <input
            id="commentPermalink"
            type="url"
            placeholder="https://www.reddit.com/r/.../comment/..."
            value={commentPermalink}
            onChange={(event) => setCommentPermalink(event.target.value)}
          />
        </div>

        {message ? <div className="notice">{message}</div> : null}

        <div className="toolbar">
          <button type="button" className="button" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : props.buttonLabel || "Start Monitoring Replies"}
          </button>
        </div>
      </div>
    </div>
  );
}
