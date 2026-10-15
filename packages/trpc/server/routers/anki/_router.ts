import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { ZGetReviewQueueSchema } from "./get-review-queue.schema";
import { getReviewQueueHandler } from "./get-review-queue.handler";
import { ZSubmitReviewSchema } from "./submit-review.schema";
import { submitReviewHandler } from "./submit-review.handler";
import { ZImportPackageSchema } from "./import-package.schema";
import { importPackageHandler } from "./import-package.handler";

export const ankiRouter = createTRPCRouter({
  getReviewQueue: protectedProcedure
    .input(ZGetReviewQueueSchema)
    .query(async ({ ctx, input }) => {
      return getReviewQueueHandler({ ctx, input });
    }),

  submitReview: protectedProcedure
    .input(ZSubmitReviewSchema)
    .mutation(async ({ ctx, input }) => {
      return submitReviewHandler({ ctx, input });
    }),

  importPackage: protectedProcedure
    .input(ZImportPackageSchema)
    .mutation(async ({ ctx, input }) => {
      return importPackageHandler({ ctx, input });
    }),
});

export default ankiRouter;
