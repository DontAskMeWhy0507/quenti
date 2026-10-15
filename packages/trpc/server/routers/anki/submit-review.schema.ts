import { z } from "zod";

export const ZSubmitReviewSchema = z.object({
  studySetId: z.string(),
  termId: z.string(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export type TSubmitReviewSchema = z.infer<typeof ZSubmitReviewSchema>;
