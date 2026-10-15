import fs from "fs";
import path from "path";
import JSZip from "jszip";
import * as fzstd from "fzstd";
import { PrismaClient } from "@prisma/client";
import { parseAnkiPackage } from "../packages/lib/src/anki/parser";

function safeTruncate(str: string, maxLen = 1000): string {
  if (!str || str.length <= maxLen) return str;
  let cut = str.slice(0, maxLen);
  const lastOpen = cut.lastIndexOf("<");
  const lastClose = cut.lastIndexOf(">");
  if (lastOpen > lastClose) {
    cut = cut.slice(0, lastOpen);
  }
  return cut;
}

async function main() {
  const args = process.argv.slice(2);
  const apkgPath = args.find((a) => !a.startsWith("--")) || "All Decks.apkg";
  const isDryRun = args.includes("--dryRun") || args.includes("--dry-run");

  const userIdArgIndex = args.indexOf("--userId");
  let targetUserId = userIdArgIndex !== -1 ? args[userIdArgIndex + 1] : undefined;

  const mediaDirArgIndex = args.indexOf("--mediaDir");
  const mediaDir = mediaDirArgIndex !== -1
    ? path.resolve(args[mediaDirArgIndex + 1])
    : path.resolve(process.cwd(), "apps/next/public/uploads/anki");

  console.log("=========================================");
  console.log("       Anki Package Importer CLI         ");
  console.log("=========================================");
  console.log(`Package:   ${apkgPath}`);
  console.log(`Dry Run:   ${isDryRun ? "YES" : "NO"}`);
  console.log(`Media Dir: ${mediaDir}`);

  if (!fs.existsSync(apkgPath)) {
    console.error(`Error: File not found: ${apkgPath}`);
    process.exit(1);
  }

  const startTime = Date.now();
  console.log("\nParsing Anki package metadata...");
  const parsed = await parseAnkiPackage(path.resolve(apkgPath), {
    mediaUrlPrefix: "/api/anki/media",
  });

  const totalCards = parsed.decks.reduce((sum, d) => sum + d.cards.length, 0);
  console.log(`Successfully parsed collection in ${(Date.now() - startTime) / 1000}s!`);
  console.log(`- Decks found:      ${parsed.decks.length}`);
  console.log(`- Total cards:      ${totalCards}`);
  console.log(`- Media dictionary: ${Object.keys(parsed.mediaMap).length} entries`);

  console.log("\nDecks summary:");
  for (const d of parsed.decks) {
    console.log(`  * ${d.name} (${d.cards.length} cards)`);
  }

  if (isDryRun) {
    console.log("\n[DRY RUN COMPLETE] No database changes made.");
    return;
  }

  // Database operations
  const prisma = new PrismaClient();
  try {
    if (!targetUserId) {
      const firstUser = await prisma.user.findFirst();
      if (!firstUser) {
        // Create a default local user if database is completely empty
        const defaultUser = await prisma.user.create({
          data: {
            email: "anki-user@quenti.local",
            username: "anki_user",
            name: "Anki Importer",
          },
        });
        targetUserId = defaultUser.id;
        console.log(`Created default user: ${targetUserId}`);
      } else {
        targetUserId = firstUser.id;
        console.log(`Using existing user: ${firstUser.username || firstUser.email} (${targetUserId})`);
      }
    }

    // Media extraction
    if (Object.keys(parsed.mediaMap).length > 0) {
      console.log(`\nExtracting media to ${mediaDir}...`);
      fs.mkdirSync(mediaDir, { recursive: true });
      const rawData = fs.readFileSync(apkgPath);
      const zip = await JSZip.loadAsync(rawData);
      let extractedCount = 0;

      for (const [entryId, originalFilename] of Object.entries(parsed.mediaMap)) {
        const fileEntry = zip.file(entryId);
        if (fileEntry) {
          let content = await fileEntry.async("nodebuffer");
          if (content.length >= 4 && content[0] === 0x28 && content[1] === 0xb5 && content[2] === 0x2f && content[3] === 0xfd) {
            content = Buffer.from(fzstd.decompress(content));
          }
          const safeName = path.basename(originalFilename);
          fs.writeFileSync(path.join(mediaDir, safeName), content);
          extractedCount++;
        }
      }
      console.log(`Extracted ${extractedCount} media files.`);
    }

    // Determine Folder for hierarchy
    let folderId: string | undefined = undefined;
    const sample = parsed.decks[0];
    const rootName = sample?.parentName || (parsed.decks.length > 1 ? sample?.name.split(" ")[0] : undefined);

    if (parsed.decks.length > 1 && rootName) {
      const folder = await prisma.folder.create({
        data: {
          title: rootName,
          description: "Anki Imported Deck Collection",
          userId: targetUserId,
        },
      });
      folderId = folder.id;
      console.log(`Created parent folder: ${folder.title} (${folderId})`);
    }

    for (const deck of parsed.decks) {
      if (!deck.cards.length && parsed.decks.length > 1) continue;

      const cleanTitle = deck.name.replace(/::/g, " - ");
      console.log(`\nImporting deck: "${cleanTitle}" (${deck.cards.length} cards)...`);

      const studySet = await prisma.studySet.create({
        data: {
          title: cleanTitle,
          description: `Imported from Anki (${deck.cards.length} cards)`,
          userId: targetUserId,
          created: true,
        },
      });

      if (folderId) {
        await prisma.studySetsOnFolders.create({
          data: {
            studySetId: studySet.id,
            folderId,
          },
        });
      }

      // Batch insert terms
      const batchSize = 500;
      for (let i = 0; i < deck.cards.length; i += batchSize) {
        const chunk = deck.cards.slice(i, i + batchSize);
        await prisma.term.createMany({
          data: chunk.map((c, idx) => ({
            word: safeTruncate(c.front, 1000),
            definition: safeTruncate(c.back, 1000),
            rank: i + idx,
            studySetId: studySet.id,
            assetUrl: c.imageFiles[0] ? `/uploads/anki/${path.basename(c.imageFiles[0])}` : null,
          })),
        });
      }

      console.log(`  -> Saved set ${studySet.id}`);
    }

    console.log(`\nAll done in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
