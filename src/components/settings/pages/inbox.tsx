import { updateSettings, useSettings } from "@/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import { Page, PageSection, SegmentedButtons, SettingRow } from "../primitives";
import { AvatarsSwitch } from "./appearance";

export function InboxPage() {
  const settings = useSettings();

  return (
    <Page>
      <PageSection title="Inbox">
        <SettingRow
          label="Reading pane"
          description="One shared reader, or a separate reader docked per account"
        >
          <SegmentedButtons
            options={[
              { value: "shared", label: "Shared" },
              { value: "split", label: "Per account" },
            ]}
            value={settings.readerMode}
            onChange={(readerMode) => updateSettings({ readerMode })}
          />
        </SettingRow>
        <SettingRow
          label="Mark as read"
          description="When an opened message loses its unread state"
        >
          <SegmentedButtons
            options={[
              { value: "instant", label: "Instant" },
              { value: "1s", label: "1s" },
              { value: "5s", label: "5s" },
              { value: "off", label: "Off" },
            ]}
            value={settings.markRead}
            onChange={(markRead) => updateSettings({ markRead })}
          />
        </SettingRow>
        <SettingRow
          label="Message preview"
          description="The gray line of body text under each subject"
        >
          <Switch
            checked={settings.showPreview}
            onCheckedChange={(showPreview) => updateSettings({ showPreview })}
          />
        </SettingRow>
        <SettingRow label="Preview font">
          <SegmentedButtons
            options={[
              { value: "sans", label: "Sans" },
              { value: "mono", label: "Mono" },
            ]}
            value={settings.previewFont}
            onChange={(previewFont) => updateSettings({ previewFont })}
          />
        </SettingRow>
        <SettingRow
          label="Sender avatars"
          description="Show each sender's avatar in the message list"
        >
          <AvatarsSwitch />
        </SettingRow>
      </PageSection>
    </Page>
  );
}
