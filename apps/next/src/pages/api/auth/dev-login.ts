import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@quenti/prisma";
import crypto from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_LOGIN !== "true") {
    return res.status(403).json({ error: "Dev login is only enabled in development" });
  }

  const email = (req.query.email as string) || "tuantrung0705@gmail.com";
  let user = await prisma.user.findFirst({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.findFirst();
  }

  if (!user) {
    return res.status(404).json({ error: "No user found in local database" });
  }

  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  res.setHeader(
    "Set-Cookie",
    `next-auth.session-token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
  );

  const redirectUrl = (req.query.callbackUrl as string) || "/home";
  res.redirect(302, redirectUrl);
  return;
}
