"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    await fetch("/api/auth/logout", {
      method: "POST"
    });

    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" className="button-ghost" onClick={handleLogout} disabled={loading}>
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
