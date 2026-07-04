import { useSyncExternalStore } from "react";
import type { Density } from "@/components/mail/thread-row";
import { useSettings } from "@/hooks/use-settings";

function readDialDensity(): Density | null {
  if (typeof document === "undefined") return null;
  const raw = document.documentElement.dataset.dialkitDensity;
  if (raw === "comfortable" || raw === "compact" || raw === "dense") return raw;
  return null;
}

/** Settings density, overridden by DialKit inbox panel when active. */
export function useMailDensity(): Density {
  const { density: settingsDensity } = useSettings();
  const dialDensity = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof document === "undefined") return () => {};
      const obs = new MutationObserver(onStoreChange);
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-dialkit-density"],
      });
      return () => obs.disconnect();
    },
    readDialDensity,
    () => null,
  );
  return dialDensity ?? settingsDensity;
}
