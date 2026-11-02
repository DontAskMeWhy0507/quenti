import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@quenti/prisma";
import { listDriveDecksHandler } from "@quenti/trpc/server/routers/anki/list-drive-decks.handler";
import { importFromDriveHandler } from "@quenti/trpc/server/routers/anki/import-from-drive.handler";

const TEST_FILE_ID = "1WMY0t4RzgTu1LW43BKXBNGsi81ABJDw-";

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
    const user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
    if (!user) return res.status(404).json({ error: "no user" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {
      prisma,
      session: { user: { id: user.id } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    if (action === "account") {
      const account = await prisma.account.findFirst({
        where: { userId: user.id, provider: "google" },
      });
      return res.status(200).json({
        userId: user.id,
        scope: account?.scope ?? null,
        expires_at: account?.expires_at ?? null,
        has_refresh_token: !!account?.refresh_token,
        has_access_token: !!account?.access_token,
        now: Math.floor(Date.now() / 1000),
      });
    }
    if (action === "list") {
      const out = await listDriveDecksHandler({ ctx, input: {} });
      return res.status(200).json(out);
    }
    if (action === "importTest") {
      const out = await importFromDriveHandler({
        ctx,
        input: { fileId: TEST_FILE_ID, fileName: "drive-test-deck.apkg" },
      });
      return res.status(200).json(out);
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : String(e) });
  }
}
