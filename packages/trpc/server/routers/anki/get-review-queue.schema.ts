import { z } from "zod";

export const ZGetReviewQueueSchema = z.object({
  studySetId: z.string(),
  limit: z.number().min(1).max(200).default(50),
});

export type TGetReviewQueueSchema = z.infer<typeof ZGetReviewQueueSchema>;
