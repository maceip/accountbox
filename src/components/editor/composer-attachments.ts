export type StagedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  base64: string;
};

/** Read a picked file to a base64 string (no data: prefix) for the send payload. */
export function readFileAsBase64(file: File): Promise<StagedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        base64: result.slice(result.indexOf(",") + 1),
      });
    };
    reader.readAsDataURL(file);
  });
}

// Common sendable attachment types — narrows the file picker so you can't pick something Gmail rejects (e.g. executables).
export const ACCEPT_FILES =
  "image/*,video/*,audio/*,.pdf,.txt,.csv,.md,.rtf,.json,.xml,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pages,.numbers,.key,.zip";

// Extensions Gmail won't send — re-checked after selection (accept is only a hint) so a blocked file fails clearly, not as an opaque send error.
export const BLOCKED_EXT =
  /\.(ade|adp|apk|appx|bat|cab|chm|cmd|com|cpl|dll|dmg|exe|hta|ins|isp|iso|jar|jse?|lib|lnk|mde|msc|msix?|msp|mst|nsh|pif|ps1|scr|sct|shb|sys|vbe?|vxd|wsc|wsf|wsh)$/i;
