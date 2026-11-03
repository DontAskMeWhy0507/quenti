import fs from "fs";
import { renderAnkiCard, RenderedCard } from "./template";
import {
  extractCollection,
  type RawExtractedCollection,
} from "./extractor";

export { decodeProtobufMedia } from "./extractor";
export type { RawExtractedCollection } from "./extractor";

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

export async function parseAnkiPackage(
  apkgInput: Buffer | string,
  options?: { mediaUrlPrefix?: string }
): Promise<ParseApkgResult> {
  const buffer = Buffer.isBuffer(apkgInput)
    ? apkgInput
    : fs.readFileSync(apkgInput);

  // Extraction runs in-process (TypeScript port of extractor.py) so imports
  // work in serverless runtimes where no Python binary exists.
  const rawData: RawExtractedCollection = await extractCollection(buffer);

  const deckMap = new Map<string, ParsedDeck>();
  for (const [did, rawDname] of Object.entries(rawData.decks)) {
    // Normalize \x1f or :: into clean hierarchy
    const dname = rawDname.replace(/\x1f/g, "::");
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
    const tmpl =
      notetype?.templates[card.ord] ??
      notetype?.templates[0] ??
      notetype?.templates["0"] ?? {
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
}
