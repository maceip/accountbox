/** Mailbox folders — each maps to a Gmail search query for messages.list. */
export type Folder =
  | "inbox"
  | "sent"
  | "drafts"
  | "archived"
  | "spam"
  | "trash";

export const FOLDERS: Folder[] = [
  "inbox",
  "sent",
  "drafts",
  "archived",
  "spam",
  "trash",
];

export const FOLDER_QUERY: Record<Folder, string> = {
  inbox: "in:inbox",
  sent: "in:sent",
  drafts: "in:drafts",
  // Archived = received mail that's left the inbox but isn't spam/trash.
  archived: "-in:inbox -in:sent -in:draft -in:trash -in:spam",
  spam: "in:spam",
  trash: "in:trash",
};

export function isFolder(value: unknown): value is Folder {
  return typeof value === "string" && (FOLDERS as string[]).includes(value);
}

export function toFolder(value: unknown): Folder {
  return isFolder(value) ? value : "inbox";
}
