import JSZip from "jszip";
import * as fzstd from "fzstd";
import initSqlJs, { type Database } from "sql.js";

/**
 * TypeScript port of extractor.py. Produces the exact same collection
 * structure without needing a Python runtime, so Anki imports work inside
 * serverless functions (Vercel) as well as locally.
 */

export interface RawExtractedCollection {
  decks: Record<string, string>;
  notetypes: Record<
    string,
    {
      name: string;
      fields: string[];
      templates: Record<
        number | string,
        { name: string; qfmt: string; afmt: string }
      >;
    }
  >;
  notes: Record<
    string,
    { mid: string; fields: Record<string, string>; tags: string[] }
  >;
  cards: Array<{
    id: string;
    noteId: string;
    deckId: string;
    ord: number;
    type: number;
    queue: number;
    due: number;
    interval: number;
    factor: number;
    reps: number;
    lapses: number;
  }>;
  mediaMap: Record<string, string>;
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function isZstd(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 && ZSTD_MAGIC.every((b, i) => bytes[i] === b)
  );
}

function maybeDecompress(bytes: Uint8Array): Uint8Array {
  return isZstd(bytes) ? fzstd.decompress(bytes) : bytes;
}

export function decodeProtobufMedia(
  bytes: Uint8Array,
): Record<string, string> {
  const map: Record<string, string> = {};
  let pos = 0;
  let entryIndex = 0;

  function readVarint(): number {
    let result = 0;
    let shift = 0;
    while (pos < bytes.length) {
      const b = bytes[pos++];
      if (b === undefined) break;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  while (pos < bytes.length) {
    const tag = readVarint();
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;

    if (fieldNum === 1 && wireType === 2) {
      const entryLen = readVarint();
      const endPos = pos + entryLen;
      let filename = "";

      while (pos < endPos) {
        const innerTag = readVarint();
        const innerField = innerTag >> 3;
        const innerWire = innerTag & 0x07;

        if (innerField === 1 && innerWire === 2) {
          const fnLen = readVarint();
          filename = new TextDecoder().decode(bytes.slice(pos, pos + fnLen));
          pos += fnLen;
        } else if (innerWire === 0) {
          readVarint();
        } else if (innerWire === 2) {
          const l = readVarint();
          pos += l;
        } else {
          pos++;
        }
      }

      if (filename) {
        map[String(entryIndex)] = filename;
        entryIndex++;
      }
    } else if (wireType === 2) {
      const len = readVarint();
      pos += len;
    } else if (wireType === 0) {
      readVarint();
    } else {
      pos++;
    }
  }

  return map;
}

function decodeTemplateConfig(bytes: Uint8Array): {
  qfmt: string;
  afmt: string;
} {
  let qfmt = "";
  let afmt = "";
  let pos = 0;

  function readVarint(): number {
    let result = 0;
    let shift = 0;
    while (pos < bytes.length) {
      const b = bytes[pos++];
      if (b === undefined) break;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  while (pos < bytes.length) {
    const tag = readVarint();
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;
    if (wireType === 2) {
      const len = readVarint();
      const slice = bytes.slice(pos, pos + len);
      if (fieldNum === 1) qfmt = new TextDecoder().decode(slice);
      else if (fieldNum === 2) afmt = new TextDecoder().decode(slice);
      pos += len;
    } else if (wireType === 0) {
      readVarint();
    } else {
      pos++;
    }
  }
  return { qfmt, afmt };
}

const SQL_JS_VERSION = "1.15.2";
const WASM_CDN_URL = `https://cdn.jsdelivr.net/npm/sql.js@${SQL_JS_VERSION}/dist/sql-wasm.wasm`;

async function loadWasmBinary(): Promise<Uint8Array> {
  // Prefer the wasm file shipped inside the installed sql.js package.
  // (Embedding it as a base64 source file crashed the Vercel build
  // compiler with SIGSEGV, so it must not live in the bundle.)
  try {
    const fs = await import("fs");
    const path = await import("path");
    const rel = path.join("sql.js", "dist", "sql-wasm.wasm");
    const candidates = [
      process.env.SQL_WASM_PATH,
      path.join(process.cwd(), "node_modules", rel),
      path.join(process.cwd(), "..", "..", "node_modules", rel),
      path.join("/var/task", "node_modules", rel),
    ].filter((c): c is string => !!c);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
    }
  } catch {
    // Fall through to the CDN copy.
  }
  const res = await fetch(WASM_CDN_URL);
  if (!res.ok)
    throw new Error(`Could not load sql.js wasm (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
function getSql() {
  if (!sqlPromise) {
    sqlPromise = loadWasmBinary().then((wasmBinary) =>
      initSqlJs({ wasmBinary }),
    );
  }
  return sqlPromise;
}

type Row = Record<string, unknown>;

function queryAll(db: Database, sql: string): Row[] {
  const results = db.exec(sql);
  const first = results[0];
  if (!first) return [];
  return first.values.map((values) => {
    const row: Row = {};
    first.columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  });
}

function tableExists(db: Database, name: string): boolean {
  const rows = queryAll(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
  );
  return rows.length > 0;
}

export async function extractCollection(
  apkgInput: Buffer | Uint8Array,
): Promise<RawExtractedCollection> {
  const zip = await JSZip.loadAsync(apkgInput);
  const names = Object.keys(zip.files);

  const dbEntry = names.includes("collection.anki21b")
    ? "collection.anki21b"
    : "collection.anki2";
  const dbFile = zip.file(dbEntry);
  if (!dbFile) throw new Error(`No ${dbEntry} found in Anki package`);
  const dbBytes = maybeDecompress(await dbFile.async("uint8array"));

  const SQL = await getSql();
  let db = new SQL.Database(dbBytes);
  // Anki's modern schema declares `COLLATE unicase` on several text
  // columns, and sql.js cannot register custom collations — any query
  // touching the fields/templates tables then fails ("no such collation
  // sequence" / "no query solution"). Rewrite the schema in-memory to the
  // built-in nocase collation and reopen from the exported bytes. We only
  // ever read (full scans, sorted in JS), so index key ordering built
  // under unicase does not affect results.
  try {
    db.exec("PRAGMA writable_schema=ON");
    db.exec(
      "UPDATE sqlite_master SET sql = replace(sql, 'COLLATE unicase', 'COLLATE nocase') WHERE sql LIKE '%unicase%'",
    );
    if (db.getRowsModified() > 0) {
      const exported = db.export();
      db.close();
      db = new SQL.Database(exported);
    }
  } catch {
    // Legacy databases without unicase: nothing to rewrite.
  }
  try {
    // 1. Decks
    const decks: Record<string, string> = {};
    if (tableExists(db, "decks")) {
      for (const row of queryAll(db, "SELECT id, name FROM decks")) {
        decks[String(row.id)] = String(row.name);
      }
    } else {
      const rows = queryAll(db, "SELECT decks FROM col");
      const parsed = JSON.parse(String(rows[0]?.decks ?? "{}")) as Record<
        string,
        { name: string }
      >;
      for (const [k, v] of Object.entries(parsed)) decks[k] = v.name;
    }

    // 2. Notetypes, fields, templates
    const notetypes: RawExtractedCollection["notetypes"] = {};
    if (tableExists(db, "notetypes")) {
      for (const row of queryAll(db, "SELECT id, name FROM notetypes")) {
        notetypes[String(row.id)] = {
          name: String(row.name),
          fields: [],
          templates: {},
        };
      }
      // Sort in JS rather than ORDER BY (matches extractor.py's ordering).
      const byNtidOrd = (a: Row, b: Row) =>
        Number(a.ntid) - Number(b.ntid) || Number(a.ord) - Number(b.ord);
      for (const row of queryAll(
        db,
        "SELECT ntid, ord, name FROM fields",
      ).sort(byNtidOrd)) {
        const nt = notetypes[String(row.ntid)];
        if (nt) nt.fields.push(String(row.name));
      }
      for (const row of queryAll(
        db,
        "SELECT ntid, ord, name, config FROM templates",
      ).sort(byNtidOrd)) {
        const nt = notetypes[String(row.ntid)];
        if (nt) {
          const config = row.config;
          const bytes =
            config instanceof Uint8Array
              ? config
              : new Uint8Array((config as ArrayLike<number>) ?? []);
          const { qfmt, afmt } = decodeTemplateConfig(bytes);
          nt.templates[Number(row.ord)] = {
            name: String(row.name),
            qfmt,
            afmt,
          };
        }
      }
    } else {
      const rows = queryAll(db, "SELECT models FROM col");
      const parsed = JSON.parse(String(rows[0]?.models ?? "{}")) as Record<
        string,
        {
          name: string;
          flds?: { name: string }[];
          tmpls?: { ord: number; name: string; qfmt: string; afmt: string }[];
        }
      >;
      for (const [mid, m] of Object.entries(parsed)) {
        const templates: RawExtractedCollection["notetypes"][string]["templates"] =
          {};
        for (const t of m.tmpls ?? []) {
          templates[t.ord] = { name: t.name, qfmt: t.qfmt, afmt: t.afmt };
        }
        notetypes[mid] = {
          name: m.name,
          fields: (m.flds ?? []).map((f) => f.name),
          templates,
        };
      }
    }

    // 3. Notes
    const notes: RawExtractedCollection["notes"] = {};
    for (const row of queryAll(db, "SELECT id, mid, flds, tags FROM notes")) {
      const fieldValues = String(row.flds).split("\x1f");
      const fieldNames = notetypes[String(row.mid)]?.fields ?? [];
      const fields: Record<string, string> = {};
      fieldValues.forEach((val, i) => {
        fields[fieldNames[i] ?? `Field${i}`] = val;
      });
      notes[String(row.id)] = {
        mid: String(row.mid),
        fields,
        tags: String(row.tags ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean),
      };
    }

    // 4. Cards
    const cards: RawExtractedCollection["cards"] = queryAll(
      db,
      "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards",
    ).map((row) => ({
      id: String(row.id),
      noteId: String(row.nid),
      deckId: String(row.did),
      ord: Number(row.ord),
      type: Number(row.type),
      queue: Number(row.queue),
      due: Number(row.due),
      interval: Number(row.ivl),
      factor: Number(row.factor),
      reps: Number(row.reps),
      lapses: Number(row.lapses),
    }));

    // 5. Media map
    let mediaMap: Record<string, string> = {};
    const mediaFile = zip.file("media");
    if (mediaFile) {
      const raw = maybeDecompress(await mediaFile.async("uint8array"));
      const text = new TextDecoder().decode(raw).trimStart();
      if (text.startsWith("{")) {
        mediaMap = JSON.parse(text) as Record<string, string>;
      } else {
        mediaMap = decodeProtobufMedia(raw);
      }
    }

    return { decks, notetypes, notes, cards, mediaMap };
  } finally {
    db.close();
  }
}
