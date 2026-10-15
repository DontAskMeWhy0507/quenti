import {
  calculateNextSchedule,
  getIntervalEstimateLabel,
  CardScheduleState,
  ScheduleConfig,
} from "../packages/lib/src/anki/srs";

describe("Anki SM-2 SRS Engine", () => {
  const baseNow = new Date("2026-10-15T12:00:00Z");

  const initialNewCard: CardScheduleState = {
    queue: "New",
    step: 0,
    interval: 0,
    easeFactor: 2500,
    reps: 0,
    lapses: 0,
    due: baseNow,
    lastReviewedAt: null,
  };

  test("New card graded Good advances learning step to 10m", () => {
    const next = calculateNextSchedule(initialNewCard, 3, baseNow);
    expect(next.queue).toBe("Learning");
    expect(next.step).toBe(1);
    expect(next.reps).toBe(1);
    expect(next.interval).toBe(0);
    // 10 minutes in the future
    expect(next.due.getTime()).toBe(baseNow.getTime() + 10 * 60 * 1000);
  });

  test("New card graded Good at final step graduates to Review (1 day)", () => {
    const cardAtStep1: CardScheduleState = {
      ...initialNewCard,
      queue: "Learning",
      step: 1,
      reps: 1,
    };
    const next = calculateNextSchedule(cardAtStep1, 3, baseNow);
    expect(next.queue).toBe("Review");
    expect(next.step).toBe(0);
    expect(next.interval).toBe(1);
    expect(next.due.getTime()).toBe(baseNow.getTime() + 24 * 60 * 60 * 1000);
  });

  test("Review card graded Again resets to learning step 0, increments lapse, reduces easeFactor", () => {
    const reviewCard: CardScheduleState = {
      queue: "Review",
      step: 0,
      interval: 10,
      easeFactor: 2500,
      reps: 5,
      lapses: 0,
      due: baseNow,
      lastReviewedAt: new Date(baseNow.getTime() - 10 * 24 * 60 * 60 * 1000),
    };
    const next = calculateNextSchedule(reviewCard, 1, baseNow);
    expect(next.queue).toBe("Learning");
    expect(next.step).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.easeFactor).toBe(2300); // 2500 - 200
    expect(next.due.getTime()).toBe(baseNow.getTime() + 1 * 60 * 1000); // 1 minute
  });

  test("Ease factor clamps at minimum 1300 even after many Again ratings", () => {
    let card: CardScheduleState = {
      queue: "Review",
      step: 0,
      interval: 5,
      easeFactor: 1400,
      reps: 3,
      lapses: 2,
      due: baseNow,
      lastReviewedAt: baseNow,
    };
    card = calculateNextSchedule(card, 1, baseNow);
    expect(card.easeFactor).toBe(1300); // 1400 - 200 clamped to 1300
    card = calculateNextSchedule(card, 1, baseNow);
    expect(card.easeFactor).toBe(1300); // clamped at 1300
  });

  test("Review card graded Good multiplies interval by easeFactor / 1000", () => {
    const reviewCard: CardScheduleState = {
      queue: "Review",
      step: 0,
      interval: 10,
      easeFactor: 2500, // 2.5x
      reps: 5,
      lapses: 0,
      due: baseNow,
      lastReviewedAt: baseNow,
    };
    const next = calculateNextSchedule(reviewCard, 3, baseNow);
    expect(next.queue).toBe("Review");
    expect(next.interval).toBe(25); // 10 * 2.5 = 25 days
    expect(next.due.getTime()).toBe(baseNow.getTime() + 25 * 24 * 60 * 60 * 1000);
  });

  test("Review card graded Easy increases interval with bonus and raises ease factor", () => {
    const reviewCard: CardScheduleState = {
      queue: "Review",
      step: 0,
      interval: 10,
      easeFactor: 2500,
      reps: 5,
      lapses: 0,
      due: baseNow,
      lastReviewedAt: baseNow,
    };
    const next = calculateNextSchedule(reviewCard, 4, baseNow);
    expect(next.queue).toBe("Review");
    expect(next.easeFactor).toBe(2650); // 2500 + 150
    // 10 * 2.5 * 1.3 = 32.5 -> rounded to 33
    expect(next.interval).toBe(33);
  });

  test("getIntervalEstimateLabel returns human-friendly time badges", () => {
    expect(getIntervalEstimateLabel(initialNewCard, 1, baseNow)).toBe("< 1m");
    expect(getIntervalEstimateLabel(initialNewCard, 2, baseNow)).toBe("< 6m");
    expect(getIntervalEstimateLabel(initialNewCard, 3, baseNow)).toBe("< 10m");
    expect(getIntervalEstimateLabel(initialNewCard, 4, baseNow)).toBe("4d");

    const reviewCard: CardScheduleState = {
      queue: "Review",
      step: 0,
      interval: 10,
      easeFactor: 2500,
      reps: 5,
      lapses: 0,
      due: baseNow,
      lastReviewedAt: baseNow,
    };
    expect(getIntervalEstimateLabel(reviewCard, 1, baseNow)).toBe("< 1m");
    expect(getIntervalEstimateLabel(reviewCard, 2, baseNow)).toBe("12d");
    expect(getIntervalEstimateLabel(reviewCard, 3, baseNow)).toBe("25d");
    expect(getIntervalEstimateLabel(reviewCard, 4, baseNow)).toBe("33d");
  });
});
