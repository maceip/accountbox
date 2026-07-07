import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

const DB_FILE = "/accountbox/product.sqlite3";
const LEGACY_JSON_DIR = "betterbox-product";
const LEGACY_JSON_FILE = "store.json";
const CURRENT_SCHEMA_VERSION = 1;

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Database = InstanceType<Sqlite3["oo1"]["DB"]>;

type WorkerRequest = {
  id: number;
  method: "open" | "put" | "get" | "list" | "delete";
  args?: unknown[];
};

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

type LegacyStore = {
  tables?: Record<
    string,
    Record<string, { id?: string; data?: unknown; updatedAt?: number }>
  >;
};

let dbPromise: Promise<Database> | null = null;

function post(response: WorkerResponse) {
  self.postMessage(response);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

async function openDatabase(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const sqlite3 = await sqlite3InitModule();
      if (!sqlite3.oo1.OpfsDb) {
        throw new Error(
          `SQLite OPFS VFS is not available in this browser. diagnostics=${JSON.stringify(
            {
              hasOpfsDb: Boolean(sqlite3.oo1.OpfsDb),
              hasSharedArrayBuffer: typeof SharedArrayBuffer === "function",
              hasAtomics: typeof Atomics === "object",
              hasGetDirectory: typeof navigator.storage?.getDirectory,
              hasSyncAccessHandle:
                typeof FileSystemFileHandle !== "undefined" &&
                typeof (
                  FileSystemFileHandle.prototype as {
                    createSyncAccessHandle?: unknown;
                  }
                ).createSyncAccessHandle,
            },
          )}`,
        );
      }
      const db = new sqlite3.oo1.OpfsDb(DB_FILE, "ct");
      migrate(db);
      await migrateLegacyJsonStore(db);
      return db;
    })();
  }
  return dbPromise;
}

function migrate(db: Database) {
  db.exec(`
    PRAGMA trusted_schema = off;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      table_name TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (table_name, id)
    );
    CREATE INDEX IF NOT EXISTS records_table_updated_idx
      ON records (table_name, updated_at DESC);
    INSERT INTO meta (key, value)
      VALUES ('schema_version', '${CURRENT_SCHEMA_VERSION}')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);
}

function hasMeta(db: Database, key: string): boolean {
  return (
    db.selectValue("SELECT value FROM meta WHERE key = ?", [key]) !== undefined
  );
}

function putMeta(db: Database, key: string, value: string) {
  db.exec({
    sql: `
      INSERT INTO meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    bind: [key, value],
  });
}

async function migrateLegacyJsonStore(db: Database) {
  if (hasMeta(db, "legacy_json_migrated_at")) return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(LEGACY_JSON_DIR);
    const fileHandle = await dir.getFileHandle(LEGACY_JSON_FILE);
    const file = await fileHandle.getFile();
    if (file.size === 0) {
      putMeta(db, "legacy_json_migrated_at", new Date().toISOString());
      return;
    }
    const parsed = JSON.parse(await file.text()) as LegacyStore;
    const now = Date.now();
    for (const [table, rows] of Object.entries(parsed.tables ?? {})) {
      for (const [id, record] of Object.entries(rows ?? {})) {
        await putRecord(
          db,
          table,
          id,
          record.data ?? null,
          record.updatedAt ?? now,
        );
      }
    }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name !== "NotFoundError") {
      console.warn("[opfs-sqlite] legacy JSON migration skipped:", error);
    }
  }
  putMeta(db, "legacy_json_migrated_at", new Date().toISOString());
}

async function putRecord(
  db: Database,
  table: string,
  id: string,
  data: unknown,
  updatedAt = Date.now(),
) {
  db.exec({
    sql: `
      INSERT INTO records (table_name, id, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(table_name, id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `,
    bind: [table, id, JSON.stringify(data), updatedAt],
  });
}

function getRecord(db: Database, table: string, id: string): unknown | null {
  const data = db.selectValue(
    "SELECT data FROM records WHERE table_name = ? AND id = ?",
    [table, id],
  );
  return typeof data === "string" ? JSON.parse(data) : null;
}

function listRecords(db: Database, table: string) {
  const rows = db.selectObjects(
    `
      SELECT id, data, updated_at AS updatedAt
      FROM records
      WHERE table_name = ?
      ORDER BY updated_at DESC, id ASC
    `,
    [table],
  );
  return rows.map((row) => ({
    id: String(row.id),
    data: typeof row.data === "string" ? JSON.parse(row.data) : null,
    updatedAt: Number(row.updatedAt),
  }));
}

async function handle(request: WorkerRequest): Promise<unknown> {
  const db = await openDatabase();
  const args = request.args ?? [];
  switch (request.method) {
    case "open":
      return { ok: true, storage: "opfs-sqlite", filename: DB_FILE };
    case "put": {
      const table = requireString(args[0], "table");
      const id = requireString(args[1], "id");
      await putRecord(db, table, id, args[2] ?? null);
      return { ok: true };
    }
    case "get": {
      const table = requireString(args[0], "table");
      const id = requireString(args[1], "id");
      return getRecord(db, table, id);
    }
    case "list": {
      const table = requireString(args[0], "table");
      return listRecords(db, table);
    }
    case "delete": {
      const table = requireString(args[0], "table");
      const id = requireString(args[1], "id");
      db.exec({
        sql: "DELETE FROM records WHERE table_name = ? AND id = ?",
        bind: [table, id],
      });
      return { ok: true };
    }
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  handle(event.data).then(
    (result) => post({ id: event.data.id, ok: true, result }),
    (error) =>
      post({
        id: event.data.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});
