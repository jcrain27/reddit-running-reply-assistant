import { requireSession } from "@/lib/auth";
import { getSettingsPageData } from "@/lib/services/settingsService";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSession();
  const data = await getSettingsPageData();
  const serializable = JSON.parse(JSON.stringify(data));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-copy">
            Configure scanning, thresholds, subreddit-specific rules, notifications, and Johnny’s voice guidance.
          </p>
        </div>
      </div>

      <SettingsForm initialData={serializable} />
    </div>
  );
}
