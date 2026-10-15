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

  // Step 1: Lightweight fetch of term IDs and ranks only
  const terms = await ctx.prisma.term.findMany({
    where: { studySetId: input.studySetId, ephemeral: false },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true },
  });

  if (terms.length === 0) {
    const studySet = await ctx.prisma.studySet.findUnique({
      where: { id: input.studySetId },
      select: { id: true },
    });
    if (!studySet) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Study set not found",
      });
    }
  }

  // Step 2: Fetch existing schedules for this user in this set
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

  type LightweightCard = {
    termId: string;
    rank: number;
    queue: AnkiQueue;
    step: number;
    interval: number;
    easeFactor: number;
    reps: number;
    lapses: number;
    due: Date;
    lastReviewedAt: Date | null;
  };

  const learnDue: LightweightCard[] = [];
  const reviewDue: LightweightCard[] = [];
  const newCards: LightweightCard[] = [];

  for (const term of terms) {
    const s = scheduleMap.get(term.id);
    const queue = (s?.queue ?? "New") as AnkiQueue;
    const due = s?.due ?? now;

    const item: LightweightCard = {
      termId: term.id,
      rank: term.rank,
      queue,
      step: s?.step ?? 0,
      interval: s?.interval ?? 0,
      easeFactor: s?.easeFactor ?? 2500,
      reps: s?.reps ?? 0,
      lapses: s?.lapses ?? 0,
      due,
      lastReviewedAt: s?.lastReviewedAt ?? null,
    };

    if ((queue === "Learning" || queue === "DayLearn") && due <= now) {
      learnDue.push(item);
    } else if (queue === "Review" && due <= now) {
      reviewDue.push(item);
    } else if (queue === "New") {
      newCards.push(item);
    }
  }

  // Step 3: Pick only the top N cards for the active queue
  const targetCards = [...learnDue, ...reviewDue, ...newCards].slice(0, input.limit);
  const targetTermIds = targetCards.map((c) => c.termId);

  // Step 4: Fetch HTML definitions ONLY for the target cards (at most input.limit)
  const fullTerms = targetTermIds.length > 0
    ? await ctx.prisma.term.findMany({
        where: { id: { in: targetTermIds } },
        select: {
          id: true,
          word: true,
          definition: true,
          assetUrl: true,
        },
      })
    : [];
  const termDetailsMap = new Map(fullTerms.map((t) => [t.id, t]));

  const queueCards = targetCards.map((c) => {
    const details = termDetailsMap.get(c.termId);
    const state: CardScheduleState = {
      queue: c.queue,
      step: c.step,
      interval: c.interval,
      easeFactor: c.easeFactor,
      reps: c.reps,
      lapses: c.lapses,
      due: c.due,
      lastReviewedAt: c.lastReviewedAt,
    };

    const estimates = {
      again: getIntervalEstimateLabel(state, 1, now),
      hard: getIntervalEstimateLabel(state, 2, now),
      good: getIntervalEstimateLabel(state, 3, now),
      easy: getIntervalEstimateLabel(state, 4, now),
    };

    return {
      termId: c.termId,
      word: details?.word ?? "",
      definition: details?.definition ?? "",
      assetUrl: details?.assetUrl ?? null,
      rank: c.rank,
      queue: c.queue,
      step: c.step,
      interval: c.interval,
      easeFactor: c.easeFactor,
      reps: c.reps,
      lapses: c.lapses,
      due: c.due,
      estimates,
    };
  });

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
