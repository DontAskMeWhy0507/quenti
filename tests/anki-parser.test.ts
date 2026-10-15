import * as path from "path";
import * as fs from "fs";
import { decodeProtobufMedia, parseAnkiPackage } from "../packages/lib/src/anki/parser";

describe("Anki Archive Parser", () => {
  test("decodeProtobufMedia decodes repeated entries sequentially without colliding on sizes", () => {
    // Construct sample protobuf with 2 entries having IDENTICAL file size 8212 (0x2014):
    // Entry 0: "file1.jpg", size: 8212
    // Entry 1: "file2.jpg", size: 8212
    const makeEntry = (name: string, size: number) => {
      const fnBytes = Buffer.from(name, "utf-8");
      // field 1 (fn): tag 0x0a, length, name
      // field 2 (size): tag 0x10, varint size (8212 -> 0x94, 0x40)
      const inner = Buffer.concat([
        Buffer.from([0x0a, fnBytes.length]),
        fnBytes,
        Buffer.from([0x10, 0x94, 0x40]),
      ]);
      return Buffer.concat([
        Buffer.from([0x0a, inner.length]),
        inner,
      ]);
    };

    const payload = Buffer.concat([
      makeEntry("file1.jpg", 8212),
      makeEntry("file2.jpg", 8212),
    ]);

    const result = decodeProtobufMedia(new Uint8Array(payload));
    expect(result["0"]).toBe("file1.jpg");
    expect(result["1"]).toBe("file2.jpg");
    expect(Object.keys(result).length).toBe(2);
  });

  test("parseAnkiPackage extracts all decks, notes, cards, and complete media mapping from All Decks.apkg", async () => {
    const apkgPath = path.resolve(__dirname, "../All Decks.apkg");
    if (!fs.existsSync(apkgPath)) {
      console.warn("All Decks.apkg not found, skipping test");
      return;
    }

    const result = await parseAnkiPackage(apkgPath);

    expect(result.decks.length).toBeGreaterThanOrEqual(8);
    // All Decks.apkg has 14,951 media files: must be > 14,000 without collision dropping
    expect(Object.keys(result.mediaMap).length).toBeGreaterThan(14000);

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
