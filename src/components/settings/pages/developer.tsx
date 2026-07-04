import { useEffect, useState } from "react";
import { updateSettings, useSettings } from "@/hooks/use-settings";
import {
  clearAgentTraces,
  listAgentTraces,
  setTraceRecording,
} from "@/lib/agent/trace-recorder";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Page, PageSection, SegmentedButtons, SettingRow } from "../primitives";

/** One download per skill so a file maps 1:1 onto a retraining run. */
async function exportTraces(): Promise<number> {
  const traces = await listAgentTraces();
  if (traces.length === 0) return 0;
  const bySkill = new Map<string, typeof traces>();
  for (const t of traces) {
    const list = bySkill.get(t.skillId) ?? [];
    list.push(t);
    bySkill.set(t.skillId, list);
  }
  const day = new Date().toISOString().slice(0, 10);
  for (const [skillId, skillTraces] of bySkill) {
    const payload = {
      kind: "accountbox-trace-export",
      v: 1,
      skillId,
      exportedAt: new Date().toISOString(),
      traces: skillTraces,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accountbox-traces-${skillId}-${day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return traces.length;
}

function TracesSection() {
  const settings = useSettings();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    listAgentTraces()
      .then((ts) => setCount(ts.length))
      .catch(() => setCount(0));
  }, []);

  return (
    <PageSection title="Agent traces">
      <SettingRow
        label="Record agent plans"
        description="Real weight-driven plans are kept on this device as future training data. Nothing leaves your machine."
      >
        <Switch
          checked={settings.traceRecording}
          onCheckedChange={(traceRecording) => {
            updateSettings({ traceRecording });
            setTraceRecording(traceRecording);
          }}
        />
      </SettingRow>
      <SettingRow
        label="Traces on this device"
        description={
          count === null
            ? "Counting…"
            : count === 0
              ? "None recorded yet — run the agent on a real prompt."
              : `${count} recorded plan${count === 1 ? "" : "s"}, stored locally. Export downloads one file per skill for retraining.`
        }
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!count}
            onClick={() => void exportTraces()}
          >
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!count}
            onClick={() => {
              void clearAgentTraces().then(() => setCount(0));
            }}
          >
            Clear
          </Button>
        </div>
      </SettingRow>
    </PageSection>
  );
}

export function DeveloperPage() {
  const settings = useSettings();

  return (
    <Page>
      <PageSection title="Developer">
        <SettingRow
          label="Raw view by default"
          description="Open messages as MIME source + headers"
        >
          <Switch
            checked={settings.rawByDefault}
            onCheckedChange={(rawByDefault) => updateSettings({ rawByDefault })}
          />
        </SettingRow>
        <SettingRow label="Export format">
          <SegmentedButtons
            mono
            options={[
              { value: "md", label: ".md" },
              { value: "json", label: ".json" },
              { value: "txt", label: ".txt" },
            ]}
            value={settings.exportFormat}
            onChange={(exportFormat) => updateSettings({ exportFormat })}
          />
        </SettingRow>
      </PageSection>
      <TracesSection />
    </Page>
  );
}
