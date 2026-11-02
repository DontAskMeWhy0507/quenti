import { z } from "zod";

export const ZListDriveDecksSchema = z.object({});

export type TListDriveDecksSchema = z.infer<typeof ZListDriveDecksSchema>;
