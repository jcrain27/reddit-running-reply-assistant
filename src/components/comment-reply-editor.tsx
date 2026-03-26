"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CommentReplyEditor(props: {
  candidateId: string;
  draftReplyId: string;
  permalink: string;
  initialDraft: string;
  alternateDraft?: string;
  recommendedBlog?: {
    title: string;
    url: string;
    reason?: string | null;
  };
  allowBlogLinkAppend: boolean;
  safetyWarnings: string[];
  directSubmitEnabled: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(props.initialDraft);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const blogReadMoreHint = props.recommendedBlog
    ? `If you'd want to read more, I wrote a fuller piece on ${props.recommendedBlog.title} here: ${props.recommendedBlog.url}`
    : "";

  async function callEndpoint(
    path: string,
    body?: Record<string, unknown>
  ): Promise<{ ok: boolean; message?: string }> {
    const response = await fetch(path, {
      method: "POST",
      headers: body
        ? {
            "Content-Type": "application/json"
          }
        : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    return {
      ok: response.ok,
      message: data?.message || data?.error
    };
  }

  async function handleSave(finalAction: "NONE" | "COPY") {
    setLoading(finalAction.toLowerCase());
    setMessage(null);

    if (finalAction === "COPY") {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        setMessage("Copy to clipboard failed in this browser.");
        setLoading(null);
        return;
      }
    }

    const result = await callEndpoint(`/api/replies/${props.candidateId}/save-edit`, {
      humanEditedText: text,
      finalAction
    });

    setLoading(null);
    setMessage(
      result.ok
        ? finalAction === "COPY"
          ? "Reply copied and recorded."
          : "Draft saved."
        : result.message || "Save failed."
    );
    router.refresh();
  }

  async function handleSubmit() {
    setLoading("submit");
    setMessage(null);

    const result = await callEndpoint(`/api/replies/${props.candidateId}/submit`, {
      draftReplyId: props.draftReplyId,
      replyText: text
    });

    setLoading(null);
    setMessage(result.ok ? "Reply submitted successfully." : result.message || "Submit failed.");
    router.refresh();
  }

  async function handleSimpleAction(action: "skip" | "archive" | "regenerate") {
    setLoading(action);
    setMessage(null);

    const result = await callEndpoint(`/api/replies/${props.candidateId}/${action}`);

    setLoading(null);
    setMessage(result.ok ? `${action} complete.` : result.message || `${action} failed.`);
    router.refresh();
  }

  return (
    <div className="panel">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ fontSize: "1.4rem" }}>
            Follow-Up Editor
          </h2>
          <p className="page-copy">Keep the back-and-forth natural, useful, and explicitly human approved.</p>
        </div>
        <a href={props.permalink} target="_blank" rel="noreferrer" className="button-ghost">
          Open Reddit Thread
        </a>
      </div>

      <div className="editor">
        <textarea value={text} onChange={(event) => setText(event.target.value)} />

        {props.alternateDraft ? (
          <div className="notice">
            <strong>Alternate draft</strong>
            <div style={{ marginTop: 8 }}>{props.alternateDraft}</div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="button-ghost" onClick={() => setText(props.alternateDraft || text)}>
                Use alternate draft
              </button>
            </div>
          </div>
        ) : null}

        {props.recommendedBlog ? (
          <div className="notice">
            <strong>Related RunFitCoach blog</strong>
            <div style={{ marginTop: 8 }}>
              <a href={props.recommendedBlog.url} target="_blank" rel="noreferrer">
                {props.recommendedBlog.title}
              </a>
            </div>
            {props.recommendedBlog.reason ? (
              <div style={{ marginTop: 8 }}>{props.recommendedBlog.reason}</div>
            ) : null}
            {props.allowBlogLinkAppend ? (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => setText((current) => `${current.trim()}\n\n${blogReadMoreHint}`.trim())}
                >
                  Append read-more link
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }} className="muted">
                Kept as internal context only because this subreddit is set to no-promo.
              </div>
            )}
          </div>
        ) : null}

        {props.safetyWarnings.length ? (
          <div className="notice warning">
            <strong>Safety warnings</strong>
            <ul>
              {props.safetyWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? <div className="notice">{message}</div> : null}

        <div className="toolbar">
          <button
            type="button"
            className="button"
            onClick={() => handleSave("COPY")}
            disabled={loading !== null}
          >
            {loading === "copy" ? "Copying..." : "Copy Reply"}
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={() => handleSave("NONE")}
            disabled={loading !== null}
          >
            {loading === "none" ? "Saving..." : "Save Without Submitting"}
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={() => handleSimpleAction("regenerate")}
            disabled={loading !== null}
          >
            {loading === "regenerate" ? "Regenerating..." : "Regenerate Alternate Tone"}
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={() => handleSimpleAction("skip")}
            disabled={loading !== null}
          >
            {loading === "skip" ? "Skipping..." : "Skip"}
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={() => handleSimpleAction("archive")}
            disabled={loading !== null}
          >
            {loading === "archive" ? "Archiving..." : "Archive"}
          </button>
          <button
            type="button"
            className="button"
            onClick={handleSubmit}
            disabled={loading !== null || !props.directSubmitEnabled}
          >
            {loading === "submit" ? "Submitting..." : "Approve and Submit"}
          </button>
        </div>

        {!props.directSubmitEnabled ? (
          <div className="muted">Direct submit is disabled, so copy/paste is still the default.</div>
        ) : null}
      </div>
    </div>
  );
}
