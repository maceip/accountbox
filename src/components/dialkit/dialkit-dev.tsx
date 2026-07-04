import { useEffect, useState } from "react";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";

const STORAGE_KEY = "accountbox:dialkit";

function dialkitEnabledByDefault(): boolean {
  if (import.meta.env.VITE_DIALKIT === "on") return true;
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return true;
    if (new URLSearchParams(window.location.search).has("dialkit")) {
      localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function DialKitDevRoot() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(dialkitEnabledByDefault());
  }, []);

  if (!enabled) return null;

  return (
    <DialRoot
      position="bottom-left"
      theme="dark"
      devSession={{ projectKey: "accountbox-train" }}
      productionEnabled
    />
  );
}
