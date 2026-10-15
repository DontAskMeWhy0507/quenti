import { TRPCError } from "@trpc/server";
import type { NonNullableUserContext } from "../../lib/types";
import type { TGetReviewQueueSchema } from "./get-review-queue.schema";
import {
  CardScheduleState,
  getIntervalEstimateLabel,
  AnkiQueue,
} from "../../../../lib/src/anki/srs";

type GetReviewQueueOptions = {
  ctx: NonNullableUserContext;
  input: TGetReviewQueueSchema;
};

export const getReviewQueueHandler = async ({
  ctx,
  input,
}: GetReviewQueueOptions) => {
  const userId = ctx.session.user.id;
  const now = new Date();

  const studySet = await ctx.prisma.studySet.findUnique({
    where: { id: input.studySetId },
    select: {
      id: true,
      title: true,
      terms: {
        where: { ephemeral: false },
        orderBy: { rank: "asc" },
        select: {
          id: true,
          word: true,
          definition: true,
          assetUrl: true,
          rank: true,
        },
      },
    },
  });

  if (!studySet) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Study set not found",
    });
  }

  // Fetch existing schedules for this user in this set
  const existingSchedules = await ctx.prisma.ankiCardSchedule.findMany({
    where: {
      userId,
      studySetId: input.studySetId,
    },
  });

  const scheduleMap = new Map<string, typeof existingSchedules[0]>();
  for (const s of existingSchedules) {
    scheduleMap.set(s.termId, s);
  }

  const allCards = studySet.terms.map((term) => {
    const s = scheduleMap.get(term.id);
    const queue = (s?.queue ?? "New") as AnkiQueue;
    const step = s?.step ?? 0;
    const interval = s?.interval ?? 0;
    const easeFactor = s?.easeFactor ?? 2500;
    const reps = s?.reps ?? 0;
    const lapses = s?.lapses ?? 0;
    const due = s?.due ?? now;
    const lastReviewedAt = s?.lastReviewedAt ?? null;

    const state: CardScheduleState = {
      queue,
      step,
      interval,
      easeFactor,
      reps,
      lapses,
      due,
      lastReviewedAt,
    };

    const estimates = {
      again: getIntervalEstimateLabel(state, 1, now),
      hard: getIntervalEstimateLabel(state, 2, now),
      good: getIntervalEstimateLabel(state, 3, now),
      easy: getIntervalEstimateLabel(state, 4, now),
    };

    return {
      termId: term.id,
      word: term.word,
      definition: term.definition,
      assetUrl: term.assetUrl,
      rank: term.rank,
      queue,
      step,
      interval,
      easeFactor,
      reps,
      lapses,
      due,
      estimates,
    };
  });

  // Partition into learning due, review due, and new cards
  const learnDue = allCards.filter(
    (c) => (c.queue === "Learning" || c.queue === "DayLearn") && c.due <= now
  );
  const reviewDue = allCards.filter(
    (c) => c.queue === "Review" && c.due <= now
  );
  const newCards = allCards.filter((c) => c.queue === "New");

  // Review queue priority: learn due first, review due second, new cards third
  const queueCards = [...learnDue, ...reviewDue, ...newCards].slice(0, input.limit);

  return {
    cards: queueCards,
    counts: {
      learn: learnDue.length,
      review: reviewDue.length,
      new: newCards.length,
      totalDue: learnDue.length + reviewDue.length + newCards.length,
    },
  };
};

export default getReviewQueueHandler;
