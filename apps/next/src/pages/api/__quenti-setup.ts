import type { NextApiRequest, NextApiResponse } from "next";

import { prisma } from "@quenti/prisma";

// TEMPORARY one-time database setup endpoint for the initial deployment.
// Protected by a one-time token in the QUENTI_SETUP_TOKEN env var.
// This file is removed in the deploy immediately after the schema is created.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const token = process.env.QUENTI_SETUP_TOKEN;
  if (!token || req.headers["x-setup-token"] !== token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { statements } = (req.body ?? {}) as { statements?: string[] };
  if (!Array.isArray(statements) || statements.length === 0) {
    return res.status(400).json({ error: "statements required" });
  }

  let ok = 0;
  const errors: { index: number; error: string }[] = [];
  for (let i = 0; i < statements.length; i++) {
    try {
      await prisma.$executeRawUnsafe(statements[i]!);
      ok++;
    } catch (e) {
      errors.push({
        index: i,
        error: String((e as Error)?.message ?? e).slice(0, 300),
      });
    }
  }

  let tables = -1;
  try {
    const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
      "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    tables = Number(rows[0]?.c ?? -1);
  } catch {
    tables = -1;
  }

  return res.status(200).json({ ok, failed: errors.length, errors, tables });
}
