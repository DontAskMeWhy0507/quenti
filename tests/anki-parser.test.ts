import path from "path";
import fs from "fs";
import { decodeProtobufMedia, parseAnkiPackage } from "../packages/lib/src/anki/parser";

describe("Anki Archive Parser", () => {
  test("decodeProtobufMedia decodes varints, string filenames, and entry IDs", () => {
    // Construct sample protobuf bytes:
    // field 1, wire 2 (entry message)
    //   inner field 1, wire 2: "audio.mp3" (len 9)
    //   inner field 2, wire 0: 42 (varint 42)
    const fnBytes = Buffer.from("audio.mp3", "utf-8");
    const inner = Buffer.concat([
      Buffer.from([0x0a, fnBytes.length]),
      fnBytes,
      Buffer.from([0x10, 42]),
    ]);
    const entryMsg = Buffer.concat([
      Buffer.from([0x0a, inner.length]),
      inner,
    ]);

    const result = decodeProtobufMedia(new Uint8Array(entryMsg));
    expect(result["42"]).toBe("audio.mp3");
  });

  test("parseAnkiPackage extracts decks, notes, cards, and media mapping from All Decks.apkg", async () => {
    const apkgPath = path.resolve(__dirname, "../All Decks.apkg");
    if (!fs.existsSync(apkgPath)) {
      console.warn("All Decks.apkg not found, skipping test");
      return;
    }

    const result = await parseAnkiPackage(apkgPath);

    expect(result.decks.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(result.mediaMap).length).toBeGreaterThan(1000);

    // Verify deck structure
    const book1 = result.decks.find((d) => d.name.includes("1.Book"));
    expect(book1).toBeDefined();
    expect(book1!.cards.length).toBeGreaterThan(0);

    // Verify first card in Book 1 has rendered front, back, audio and images
    const sampleCard = book1!.cards[0];
    expect(sampleCard.front).toBeTruthy();
    expect(sampleCard.back).toBeTruthy();
    expect(sampleCard.rawFields).toBeDefined();
    expect(sampleCard.audioFiles.length + sampleCard.imageFiles.length).toBeGreaterThan(0);
  });
});
