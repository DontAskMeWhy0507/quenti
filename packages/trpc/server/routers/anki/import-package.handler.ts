import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";
import * as fzstd from "fzstd";
import type { NonNullableUserContext } from "../../lib/types";
import type { TImportPackageSchema } from "./import-package.schema";
import { parseAnkiPackage } from "../../../../lib/src/anki/parser";

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

type ImportPackageOptions = {
  ctx: NonNullableUserContext;
  input: TImportPackageSchema;
};

export const importPackageHandler = async ({
  ctx,
  input,
}: ImportPackageOptions) => {
  const userId = ctx.session.user.id;
  const buffer = Buffer.from(input.fileBase64, "base64");

  // Parse collection metadata and cards
  const parsed = await parseAnkiPackage(buffer, {
    mediaUrlPrefix: "/api/anki/media",
  });

  if (!parsed.decks.length) {
    throw new Error("No decks found in Anki package");
  }

  // Determine if there is a common parent deck or hierarchy
  let folderId: string | undefined = undefined;
  const sampleDeck = parsed.decks[0];
  const rootName = sampleDeck.parentName || (parsed.decks.length > 1 ? sampleDeck.name.split(" ")[0] : undefined);

  if (parsed.decks.length > 1 && rootName) {
    const folder = await ctx.prisma.folder.create({
      data: {
        title: rootName,
        description: "Anki Deck Collection",
        userId,
      },
    });
    folderId = folder.id;
  }

  let firstSetId = "";
  let totalTerms = 0;

  // Extract media to public uploads directory
  const uploadsBase = path.resolve(process.cwd(), "apps/next/public/uploads/anki");
  try {
    fs.mkdirSync(uploadsBase, { recursive: true });
    if (Object.keys(parsed.mediaMap).length > 0) {
      const zip = await JSZip.loadAsync(buffer);
      for (const [entryId, realName] of Object.entries(parsed.mediaMap)) {
        const fileEntry = zip.file(entryId);
        if (fileEntry) {
          let content = await fileEntry.async("nodebuffer");
          if (content.length >= 4 && content[0] === 0x28 && content[1] === 0xb5 && content[2] === 0x2f && content[3] === 0xfd) {
            content = Buffer.from(fzstd.decompress(content));
          }
          const safeName = path.basename(realName);
          fs.writeFileSync(path.join(uploadsBase, safeName), content);
        }
      }
    }
  } catch (err) {
    console.warn("Media extraction warning:", err);
  }

  for (const deck of parsed.decks) {
    if (!deck.cards.length && parsed.decks.length > 1) continue;

    const cleanTitle = deck.name.replace(/::/g, " - ");
    const studySet = await ctx.prisma.studySet.create({
      data: {
        title: cleanTitle,
        description: `Imported from Anki (${deck.cards.length} cards)`,
        userId,
        created: true,
      },
    });

    if (!firstSetId) firstSetId = studySet.id;

    if (folderId) {
      await ctx.prisma.studySetsOnFolders.create({
        data: {
          studySetId: studySet.id,
          folderId,
        },
      });
    }

    // Insert terms in batches of 500
    const batchSize = 500;
    for (let i = 0; i < deck.cards.length; i += batchSize) {
      const chunk = deck.cards.slice(i, i + batchSize);
      await ctx.prisma.term.createMany({
        data: chunk.map((c, idx) => ({
          word: safeTruncate(c.front, 1000),
          definition: safeTruncate(c.back, 1000),
          rank: i + idx,
          studySetId: studySet.id,
          assetUrl: c.imageFiles[0] ? `/uploads/anki/${path.basename(c.imageFiles[0])}` : null,
        })),
      });
    }

    totalTerms += deck.cards.length;
  }

  return {
    createdSetId: firstSetId,
    folderId,
    title: parsed.decks[0]?.name || "Anki Deck",
    termsCount: totalTerms,
    decksCount: parsed.decks.length,
  };
};

export default importPackageHandler;
