import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ["GET", "HEAD"]);
    return res.status(405).end();
  }

  const { path: pathSegments } = req.query;
  if (!pathSegments || !Array.isArray(pathSegments) || pathSegments.length === 0) {
    return res.status(400).json({ error: "Invalid media path" });
  }

  // Sanitized filename (last segment is the actual file)
  const filename = path.basename(pathSegments[pathSegments.length - 1]);
  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  // Check possible locations in public/uploads/anki/
  const baseUploadsDir = path.resolve(process.cwd(), "apps/next/public/uploads/anki");
  const relativeJoined = pathSegments.map((s) => path.basename(s)).join(path.sep);
  const pathOption1 = path.join(baseUploadsDir, relativeJoined);
  const pathOption2 = path.join(baseUploadsDir, filename);

  let targetFile = "";
  if (fs.existsSync(pathOption1)) {
    targetFile = pathOption1;
  } else if (fs.existsSync(pathOption2)) {
    targetFile = pathOption2;
  } else {
    return res.status(404).json({ error: "Media not found" });
  }

  const stat = fs.statSync(targetFile);

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  const stream = fs.createReadStream(targetFile);
  stream.pipe(res);
}
