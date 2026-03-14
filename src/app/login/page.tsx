import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { APP_NAME } from "@/lib/constants";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/inbox");
  }

  return (
    <div className="login-shell">
      <div className="panel login-card">
        <p className="brand-kicker">Johnny Crain / RunFitCoach</p>
        <h1 className="page-title" style={{ fontSize: "2.1rem" }}>
          {APP_NAME}
        </h1>
        <p className="page-copy">
          Private, human-reviewed Reddit draft assistance focused on genuinely helpful running advice.
        </p>
        <div style={{ marginTop: 18 }}>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
