import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import { NavLink } from "@/components/nav-link";
import { APP_NAME } from "@/lib/constants";
import { getSession } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Private human-in-the-loop Reddit reply assistant for Johnny Crain."
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getSession();

  if (!session) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <p className="brand-kicker">Private Dashboard</p>
              <h1 className="brand-title">{APP_NAME}</h1>
              <p className="brand-copy">RunFitCoach triage, drafting, and review for Reddit advice threads.</p>
            </div>

            <nav className="nav">
              <NavLink href="/inbox" label="Inbox" />
              <NavLink href="/replies" label="Replies" />
              <NavLink href="/settings" label="Settings" />
              <NavLink href="/analytics" label="Analytics" />
            </nav>

            <div className="sidebar-footer split-list">
              <div>Signed in as {session.email}</div>
              <LogoutButton />
            </div>
          </aside>

          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
