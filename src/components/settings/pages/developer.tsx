import { updateSettings, useSettings } from "@/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import { Page, PageSection, SegmentedButtons, SettingRow } from "../primitives";

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
    </Page>
  );
}
