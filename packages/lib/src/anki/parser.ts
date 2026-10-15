import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { renderAnkiCard, RenderedCard } from "./template";

export interface ParsedCard {
  id: string;
  noteId: string;
  deckId: string;
  front: string;
  back: string;
  rawFields: Record<string, string>;
  audioFiles: string[];
  imageFiles: string[];
  tags: string[];
  srs?: {
    queue: number;
    interval: number;
    factor: number;
    reps: number;
    lapses: number;
    due: number;
  };
}

export interface ParsedDeck {
  id: string;
  name: string;
  parentName?: string;
  cards: ParsedCard[];
}

export interface ParseApkgResult {
  decks: ParsedDeck[];
  mediaMap: Record<string, string>; // zipEntryName -> originalFilename
}

export function decodeProtobufMedia(bytes: Uint8Array): Record<string, string> {
  const map: Record<string, string> = {};
  let pos = 0;

  function readVarint(): number {
    let result = 0;
    let shift = 0;
    while (pos < bytes.length) {
      const b = bytes[pos++];
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
      let entryId = "";

      while (pos < endPos) {
        const innerTag = readVarint();
        const innerField = innerTag >> 3;
        const innerWire = innerTag & 0x07;

        if (innerField === 1 && innerWire === 2) {
          const fnLen = readVarint();
          filename = new TextDecoder().decode(bytes.slice(pos, pos + fnLen));
          pos += fnLen;
        } else if (innerField === 2 && innerWire === 0) {
          const idNum = readVarint();
          entryId = String(idNum);
        } else if (innerWire === 0) {
          readVarint();
        } else if (innerWire === 2) {
          const l = readVarint();
          pos += l;
        } else {
          pos++;
        }
      }

      if (entryId && filename) {
        map[entryId] = filename;
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

export interface RawExtractedCollection {
  decks: Record<string, string>;
  notetypes: Record<string, {
    name: string;
    fields: string[];
    templates: Record<number | string, {
      name: string;
      qfmt: string;
      afmt: string;
    }>;
  }>;
  notes: Record<string, {
    mid: string;
    fields: Record<string, string>;
    tags: string[];
  }>;
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

export async function parseAnkiPackage(
  apkgInput: Buffer | string,
  options?: { mediaUrlPrefix?: string }
): Promise<ParseApkgResult> {
  const isBuffer = Buffer.isBuffer(apkgInput);
  let tempApkgPath = "";
  let apkgPath = "";

  if (isBuffer) {
    tempApkgPath = path.join(os.tmpdir(), `anki_in_${Date.now()}_${Math.random().toString(36).slice(2)}.apkg`);
    fs.writeFileSync(tempApkgPath, apkgInput);
    apkgPath = tempApkgPath;
  } else {
    apkgPath = apkgInput;
  }

  const tempJsonPath = path.join(os.tmpdir(), `anki_meta_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const extractorScript = path.join(__dirname, "extractor.py");

  try {
    // Run python extractor
    execFileSync("python", [extractorScript, apkgPath, "--output", tempJsonPath], {
      windowsHide: true,
      maxBuffer: 100 * 1024 * 1024,
    });

    const rawData: RawExtractedCollection = JSON.parse(fs.readFileSync(tempJsonPath, "utf-8"));

    const deckMap = new Map<string, ParsedDeck>();
    for (const [did, dname] of Object.entries(rawData.decks)) {
      // Determine parent name if :: or naming convention
      let parentName: string | undefined = undefined;
      if (dname.includes("::")) {
        const parts = dname.split("::");
        parentName = parts.slice(0, -1).join("::");
      }
      deckMap.set(did, {
        id: did,
        name: dname,
        parentName,
        cards: [],
      });
    }

    const prefix = options?.mediaUrlPrefix ?? "";

    // Process and render cards
    for (const card of rawData.cards) {
      const note = rawData.notes[card.noteId];
      if (!note) continue;

      const notetype = rawData.notetypes[note.mid];
      const tmpl = notetype?.templates[card.ord] ?? {
        name: "Default",
        qfmt: "{{Front}}",
        afmt: "{{Back}}",
      };

      const rendered: RenderedCard = renderAnkiCard({
        qfmt: tmpl.qfmt,
        afmt: tmpl.afmt,
        fields: note.fields,
        clozeOrdinal: card.ord + 1,
        mediaUrlPrefix: prefix,
      });

      const parsedCard: ParsedCard = {
        id: card.id,
        noteId: card.noteId,
        deckId: card.deckId,
        front: rendered.questionHtml,
        back: rendered.answerHtml,
        rawFields: note.fields,
        audioFiles: rendered.audioFiles,
        imageFiles: rendered.imageFiles,
        tags: note.tags,
        srs: {
          queue: card.queue,
          interval: card.interval,
          factor: card.factor,
          reps: card.reps,
          lapses: card.lapses,
          due: card.due,
        },
      };

      const deck = deckMap.get(card.deckId);
      if (deck) {
        deck.cards.push(parsedCard);
      }
    }

    // Filter out empty Default deck if other populated decks exist
    const decks = Array.from(deckMap.values()).filter(
      (d) => d.cards.length > 0 || d.name !== "Default"
    );

    return {
      decks,
      mediaMap: rawData.mediaMap,
    };
  } finally {
    try {
      if (tempApkgPath && fs.existsSync(tempApkgPath)) fs.unlinkSync(tempApkgPath);
      if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
    } catch {
      // Ignore cleanup error
    }
  }
}
