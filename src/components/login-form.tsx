"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Login failed.");
      setLoading(false);
      return;
    }

    router.replace("/inbox");
    router.refresh();
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="johnny@runfitcoach.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <button type="submit" className="button" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
