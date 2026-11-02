import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@quenti/prisma";

const OLD = "https://doht1ihbiieip3d5.public.blob.vercel-storage.com";
const NEW =
  "https://cdn.jsdelivr.net/gh/DontAskMeWhy0507/quenti-media@main";

function numify(rows: Record<string, unknown>[]) {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        typeof v === "bigint" ? Number(v) : v,
      ]),
    ),
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "method not allowed" });
  if (req.headers["x-setup-token"] !== process.env.QUENTI_SETUP_TOKEN)
    return res.status(401).json({ error: "unauthorized" });

  const { action } = (req.body ?? {}) as { action?: string };
  try {
    if (action === "counts") {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT
          (SELECT COUNT(*) FROM Term WHERE word LIKE '%blob.vercel-storage.com%') AS word_old,
          (SELECT COUNT(*) FROM Term WHERE definition LIKE '%blob.vercel-storage.com%') AS def_old,
          (SELECT COUNT(*) FROM Term WHERE assetUrl LIKE '%blob.vercel-storage.com%') AS asset_old,
          (SELECT COUNT(*) FROM Term WHERE CAST(wordRichText AS CHAR) LIKE '%blob.vercel-storage.com%') AS wordrt_old,
          (SELECT COUNT(*) FROM Term WHERE CAST(definitionRichText AS CHAR) LIKE '%blob.vercel-storage.com%') AS defrt_old,
          (SELECT COUNT(*) FROM Term WHERE definition LIKE '%cdn.jsdelivr.net/gh/DontAskMeWhy0507/quenti-media%') AS def_new,
          (SELECT COUNT(*) FROM Term WHERE assetUrl LIKE '%cdn.jsdelivr.net/gh/DontAskMeWhy0507/quenti-media%') AS asset_new,
          (SELECT MAX(LENGTH(definition)) FROM Term WHERE definition LIKE '%blob.vercel-storage.com%') AS def_max_len,
          (SELECT MAX(LENGTH(word)) FROM Term WHERE word LIKE '%blob.vercel-storage.com%') AS word_max_len`,
      );
      return res.status(200).json(numify(rows));
    }
    if (action === "swap") {
      const results: Record<string, number> = {};
      for (const col of ["word", "definition", "assetUrl"]) {
        results[col] = await prisma.$executeRawUnsafe(
          `UPDATE Term SET ${col} = REPLACE(${col}, ?, ?) WHERE ${col} LIKE '%blob.vercel-storage.com%'`,
          OLD,
          NEW,
        );
      }
      for (const col of ["wordRichText", "definitionRichText"]) {
        results[col] = await prisma.$executeRawUnsafe(
          `UPDATE Term SET ${col} = CAST(REPLACE(CAST(${col} AS CHAR), ?, ?) AS JSON) WHERE CAST(${col} AS CHAR) LIKE '%blob.vercel-storage.com%'`,
          OLD,
          NEW,
        );
      }
      return res.status(200).json(results);
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : String(e) });
  }
}
