import type { NextApiRequest, NextApiResponse } from "next";

import { prisma } from "@quenti/prisma";

// Temporary one-off import endpoint (token-protected). Deleted after use.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-setup-token"] !== process.env.QUENTI_SETUP_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const action = body?.action as string;

  try {
    if (action === "info") {
      const user = await prisma.user.findFirst({
        select: { id: true, email: true, name: true },
      });
      const existing = await prisma.studySet.count({
        where: { title: { startsWith: "4000 Essential English Words" } },
      });
      return res.json({ user, existingSets: existing });
    }

    if (action === "createFolder") {
      const user = await prisma.user.findFirst({ select: { id: true } });
      if (!user) return res.status(400).json({ error: "no user" });
      const folder = await prisma.folder.create({
        data: { title: body.title, description: body.description, userId: user.id },
      });
      return res.json({ folderId: folder.id });
    }

    if (action === "createSet") {
      const user = await prisma.user.findFirst({ select: { id: true } });
      if (!user) return res.status(400).json({ error: "no user" });
      const set = await prisma.studySet.create({
        data: {
          title: body.title,
          description: body.description,
          userId: user.id,
          created: true,
          tags: ["anki"],
        },
      });
      if (body.folderId) {
        await prisma.studySetsOnFolders.create({
          data: { studySetId: set.id, folderId: body.folderId },
        });
      }
      return res.json({ setId: set.id });
    }

    if (action === "addTerms") {
      const terms = body.terms as {
        word: string;
        definition: string;
        rank: number;
        assetUrl: string | null;
      }[];
      const result = await prisma.term.createMany({
        data: terms.map((t) => ({ ...t, studySetId: body.setId })),
      });
      return res.json({ inserted: result.count });
    }

    if (action === "counts") {
      const sets = await prisma.studySet.findMany({
        where: { title: { startsWith: "4000 Essential English Words" } },
        select: {
          id: true,
          title: true,
          _count: { select: { terms: true } },
        },
        orderBy: { title: "asc" },
      });
      return res.json({ sets });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
}
