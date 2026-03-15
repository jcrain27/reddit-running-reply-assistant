"use client";

import { useState } from "react";

type SettingsPayload = {
  appSettings: {
    scanFrequencyMinutes: number;
    maxPostAgeHours: number;
    minAdviceScore: number;
    notificationThreshold: number;
    enableDirectSubmit: boolean;
    enableCTASuggestions: boolean;
    maxSuggestedRepliesPerDay: number;
    notificationEmailEnabled: boolean;
    notificationSlackEnabled: boolean;
    notificationEmailTo: string | null;
    notificationSlackWebhookUrl: string | null;
    bannedPhrases: string[];
    medicalRiskKeywords: string[];
  };
  subreddits: Array<{
    name: string;
    enabled: boolean;
    allowDirectSubmit: boolean;
    allowCTA: boolean;
    strictNoPromo: boolean;
    maxRepliesPerDay: number;
    minAdviceScore: number;
    maxReplyLength: number;
    advancedTone: boolean;
    medicalCautionStrictness: number;
    notes: string | null;
    rules: Array<{
      ruleType: string;
      ruleValue: string;
    }>;
  }>;
  voiceExamples: Array<{
    label: string;
    sourceType: string;
    content: string;
    enabled: boolean;
  }>;
};

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function SettingsForm({ initialData }: { initialData: SettingsPayload }) {
  const [settings, setSettings] = useState(initialData);
  const [allowlistText, setAllowlistText] = useState(
    initialData.subreddits.map((item) => item.name).join("\n")
  );
  const [rulesText, setRulesText] = useState(
    initialData.subreddits
      .flatMap((subreddit) =>
        subreddit.rules.map((rule) => `${subreddit.name}|${rule.ruleType}|${rule.ruleValue}`)
      )
      .join("\n")
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  const subredditRows = settings.subreddits;

  async function saveSettings() {
    setSaving(true);
    setSaveMessage(null);

    const names = parseLines(allowlistText).map((entry) => entry.toLowerCase());
    const configMap = new Map(subredditRows.map((row) => [row.name, row]));
    const payload = {
      appSettings: settings.appSettings,
      subreddits: names.map((name) => {
        const existing = configMap.get(name);
        return (
          existing || {
            name,
            enabled: true,
            allowDirectSubmit: false,
            allowCTA: false,
            strictNoPromo: true,
            maxRepliesPerDay: 2,
            minAdviceScore: settings.appSettings.minAdviceScore,
            maxReplyLength: 900,
            advancedTone: false,
            medicalCautionStrictness: 70,
            notes: ""
          }
        );
      }),
      subredditRules: parseLines(rulesText).map((line) => {
        const [subreddit, ruleType, ...rest] = line.split("|");
        return {
          subreddit: subreddit?.trim() || "",
          ruleType: ruleType?.trim() || "",
          ruleValue: rest.join("|").trim()
        };
      })
    };

    const response = await fetch("/api/settings/subreddits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    setSaving(false);
    setSaveMessage(response.ok ? "Settings saved." : "Settings save failed.");
  }

  async function saveVoiceExamples() {
    setSavingVoice(true);
    setVoiceMessage(null);

    const response = await fetch("/api/settings/voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        voiceExamples: settings.voiceExamples
      })
    });

    setSavingVoice(false);
    setVoiceMessage(response.ok ? "Voice examples saved." : "Voice save failed.");
  }

  return (
    <div className="page">
      <div className="panel">
        <div className="page-header">
          <div>
            <h2 className="page-title" style={{ fontSize: "1.4rem" }}>
              Global Settings
            </h2>
            <p className="page-copy">These settings shape scan thresholds, notifications, and safety defaults.</p>
          </div>
          <button type="button" className="button" onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {saveMessage ? <div className="notice">{saveMessage}</div> : null}

        <div className="form-grid">
          <div className="fields-3">
            <div className="field">
              <label>Scan frequency (minutes)</label>
              <input
                type="number"
                value={settings.appSettings.scanFrequencyMinutes}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      scanFrequencyMinutes: Number(event.target.value)
                    }
                  }))
                }
              />
            </div>

            <div className="field">
              <label>Max post age (hours)</label>
              <input
                type="number"
                value={settings.appSettings.maxPostAgeHours}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      maxPostAgeHours: Number(event.target.value)
                    }
                  }))
                }
              />
            </div>

            <div className="field">
              <label>Minimum advice score</label>
              <input
                type="number"
                value={settings.appSettings.minAdviceScore}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      minAdviceScore: Number(event.target.value)
                    }
                  }))
                }
              />
            </div>

            <div className="field">
              <label>Notification threshold</label>
              <input
                type="number"
                value={settings.appSettings.notificationThreshold}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      notificationThreshold: Number(event.target.value)
                    }
                  }))
                }
              />
            </div>

            <div className="field">
              <label>Max suggested replies per day</label>
              <input
                type="number"
                value={settings.appSettings.maxSuggestedRepliesPerDay}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      maxSuggestedRepliesPerDay: Number(event.target.value)
                    }
                  }))
                }
              />
            </div>

            <div className="field">
              <label>Notification email</label>
              <input
                type="email"
                value={settings.appSettings.notificationEmailTo || ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      notificationEmailTo: event.target.value
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="checkbox-row">
            {[
              ["enableDirectSubmit", "Enable direct Reddit submit"],
              ["enableCTASuggestions", "Enable CTA suggestions"],
              ["notificationEmailEnabled", "Enable email notifications"],
              ["notificationSlackEnabled", "Enable Slack notifications"]
            ].map(([key, label]) => (
              <label key={key} className="checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(settings.appSettings[key as keyof typeof settings.appSettings])}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      appSettings: {
                        ...current.appSettings,
                        [key]: event.target.checked
                      }
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <div className="fields-2">
            <div className="field">
              <label>Subreddit allowlist</label>
              <textarea value={allowlistText} onChange={(event) => setAllowlistText(event.target.value)} />
            </div>
            <div className="field">
              <label>Slack webhook override</label>
              <textarea
                value={settings.appSettings.notificationSlackWebhookUrl || ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      notificationSlackWebhookUrl: event.target.value
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="fields-2">
            <div className="field">
              <label>Banned phrases</label>
              <textarea
                value={settings.appSettings.bannedPhrases.join("\n")}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      bannedPhrases: parseLines(event.target.value)
                    }
                  }))
                }
              />
            </div>
            <div className="field">
              <label>Medical-risk keywords</label>
              <textarea
                value={settings.appSettings.medicalRiskKeywords.join("\n")}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    appSettings: {
                      ...current.appSettings,
                      medicalRiskKeywords: parseLines(event.target.value)
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="field">
            <label>Subreddit-specific rules (`subreddit|ruleType|ruleValue`)</label>
            <textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} />
            <div className="muted">
              Supported rule types: `banned_phrase`, `medical_keyword`, `skip_keyword`,
              `required_keyword`, `advice_boost_keyword`, `relevance_keyword`, `style_hint`,
              `default_reply_style`, `cta_style`.
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="page-header">
          <div>
            <h2 className="page-title" style={{ fontSize: "1.4rem" }}>
              Subreddit Profiles
            </h2>
            <p className="page-copy">Tune tone, reply caps, CTA allowances, and medical caution per subreddit.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subreddit</th>
                <th>Enabled</th>
                <th>Direct Submit</th>
                <th>CTA</th>
                <th>No Promo</th>
                <th>Advanced Tone</th>
                <th>Max/Day</th>
                <th>Min Score</th>
                <th>Max Length</th>
                <th>Medical Strictness</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {subredditRows.map((row, index) => (
                <tr key={row.name}>
                  <td className="mono">{row.name}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], enabled: event.target.checked };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.allowDirectSubmit}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], allowDirectSubmit: event.target.checked };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.allowCTA}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], allowCTA: event.target.checked };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.strictNoPromo}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], strictNoPromo: event.target.checked };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.advancedTone}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], advancedTone: event.target.checked };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.maxRepliesPerDay}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], maxRepliesPerDay: Number(event.target.value) };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.minAdviceScore}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], minAdviceScore: Number(event.target.value) };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.maxReplyLength}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], maxReplyLength: Number(event.target.value) };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.medicalCautionStrictness}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = {
                            ...next[index],
                            medicalCautionStrictness: Number(event.target.value)
                          };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.notes || ""}
                      onChange={(event) =>
                        setSettings((current) => {
                          const next = [...current.subreddits];
                          next[index] = { ...next[index], notes: event.target.value };
                          return { ...current, subreddits: next };
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="page-header">
          <div>
            <h2 className="page-title" style={{ fontSize: "1.4rem" }}>
              Johnny Voice Examples
            </h2>
            <p className="page-copy">
              These examples guide draft tone now and can support future prompt tuning later.
              Use source types like `story`, `experience`, or `anecdote` for short real story fragments.
              The app should use those sparingly and never invent first-hand details that are not true.
            </p>
          </div>
          <button type="button" className="button" onClick={saveVoiceExamples} disabled={savingVoice}>
            {savingVoice ? "Saving..." : "Save Voice Examples"}
          </button>
        </div>

        {voiceMessage ? <div className="notice">{voiceMessage}</div> : null}

        <div className="split-list">
          {settings.voiceExamples.map((example, index) => (
            <div key={`${example.label}-${index}`} className="panel panel-tight">
              <div className="fields-3">
                <div className="field">
                  <label>Label</label>
                  <input
                    type="text"
                    value={example.label}
                    onChange={(event) =>
                      setSettings((current) => {
                        const next = [...current.voiceExamples];
                        next[index] = { ...next[index], label: event.target.value };
                        return { ...current, voiceExamples: next };
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Source type</label>
                  <input
                    type="text"
                    value={example.sourceType}
                    onChange={(event) =>
                      setSettings((current) => {
                        const next = [...current.voiceExamples];
                        next[index] = { ...next[index], sourceType: event.target.value };
                        return { ...current, voiceExamples: next };
                      })
                    }
                  />
                </div>
                <label className="checkbox" style={{ alignSelf: "end" }}>
                  <input
                    type="checkbox"
                    checked={example.enabled}
                    onChange={(event) =>
                      setSettings((current) => {
                        const next = [...current.voiceExamples];
                        next[index] = { ...next[index], enabled: event.target.checked };
                        return { ...current, voiceExamples: next };
                      })
                    }
                  />
                  Enabled
                </label>
              </div>

              <div className="field">
                <label>Example</label>
                <textarea
                  value={example.content}
                  onChange={(event) =>
                    setSettings((current) => {
                      const next = [...current.voiceExamples];
                      next[index] = { ...next[index], content: event.target.value };
                      return { ...current, voiceExamples: next };
                    })
                  }
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            className="button-ghost"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                voiceExamples: [
                  ...current.voiceExamples,
                  {
                    label: "New voice example",
                    sourceType: "manual",
                    content: "",
                    enabled: true
                  }
                ]
              }))
            }
          >
            Add Voice Example
          </button>
        </div>
      </div>
    </div>
  );
}
