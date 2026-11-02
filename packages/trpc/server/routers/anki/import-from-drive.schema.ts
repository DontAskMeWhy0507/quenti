import { z } from "zod";

export const ZImportFromDriveSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
});

export type TImportFromDriveSchema = z.infer<typeof ZImportFromDriveSchema>;
