import { z } from "zod";

export const ZImportPackageSchema = z.object({
  fileBase64: z.string().min(1),
  fileName: z.string().default("anki_deck.apkg"),
});

export type TImportPackageSchema = z.infer<typeof ZImportPackageSchema>;
