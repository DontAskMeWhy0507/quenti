export type AnkiRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy
export type AnkiQueue = "New" | "Learning" | "Review" | "DayLearn" | "Suspended";

export interface CardScheduleState {
  queue: AnkiQueue;
  step: number;        // Step index in learningStepsMinutes
  interval: number;    // Days (0 if intraday learning)
  easeFactor: number;  // 2500 = 250%
  reps: number;
  lapses: number;
  due: Date;
  lastReviewedAt: Date | null;
}

export interface ScheduleConfig {
  learningStepsMinutes: number[]; // default: [1, 10]
  graduatingIntervalDays: number; // default: 1
  easyIntervalDays: number;       // default: 4
  startingEaseFactor: number;     // default: 2500
  minimumEaseFactor: number;      // default: 1300
  hardIntervalMultiplier: number; // default: 1.2
  easyIntervalBonus: number;      // default: 1.3
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  learningStepsMinutes: [1, 10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  startingEaseFactor: 2500,
  minimumEaseFactor: 1300,
  hardIntervalMultiplier: 1.2,
  easyIntervalBonus: 1.3,
};

export function calculateNextSchedule(
  current: CardScheduleState,
  rating: AnkiRating,
  now: Date = new Date(),
  customConfig?: Partial<ScheduleConfig>
): CardScheduleState {
  const config: ScheduleConfig = { ...DEFAULT_SCHEDULE_CONFIG, ...customConfig };
  const reps = current.reps + 1;
  const isLearning = current.queue === "New" || current.queue === "Learning" || current.queue === "DayLearn";

  if (isLearning) {
    switch (rating) {
      case 1: { // Again
        const step = 0;
        const minutes = config.learningStepsMinutes[step] ?? 1;
        return {
          queue: "Learning",
          step,
          interval: 0,
          easeFactor: Math.max(config.minimumEaseFactor, current.easeFactor - 200),
          reps,
          lapses: current.lapses + 1,
          due: new Date(now.getTime() + minutes * 60 * 1000),
          lastReviewedAt: now,
        };
      }
      case 2: { // Hard: repeat current step or average between current and next step (e.g. 6m for [1, 10])
        const currentStepMinutes = config.learningStepsMinutes[current.step] ?? 1;
        const nextStepMinutes = config.learningStepsMinutes[current.step + 1] ?? currentStepMinutes;
        const minutes = Math.round((currentStepMinutes + nextStepMinutes) / 2);
        return {
          queue: "Learning",
          step: current.step,
          interval: 0,
          easeFactor: current.easeFactor,
          reps,
          lapses: current.lapses,
          due: new Date(now.getTime() + minutes * 60 * 1000),
          lastReviewedAt: now,
        };
      }
      case 3: { // Good
        const nextStep = current.step + 1;
        if (nextStep < config.learningStepsMinutes.length) {
          const minutes = config.learningStepsMinutes[nextStep] ?? 10;
          return {
            queue: "Learning",
            step: nextStep,
            interval: 0,
            easeFactor: current.easeFactor,
            reps,
            lapses: current.lapses,
            due: new Date(now.getTime() + minutes * 60 * 1000),
            lastReviewedAt: now,
          };
        } else {
          // Graduate to Review
          const interval = config.graduatingIntervalDays;
          return {
            queue: "Review",
            step: 0,
            interval,
            easeFactor: current.easeFactor,
            reps,
            lapses: current.lapses,
            due: new Date(now.getTime() + interval * 24 * 60 * 60 * 1000),
            lastReviewedAt: now,
          };
        }
      }
      case 4: { // Easy
        const interval = config.easyIntervalDays;
        return {
          queue: "Review",
          step: 0,
          interval,
          easeFactor: current.easeFactor,
          reps,
          lapses: current.lapses,
          due: new Date(now.getTime() + interval * 24 * 60 * 60 * 1000),
          lastReviewedAt: now,
        };
      }
    }
  }

  // Card is in Review queue
  switch (rating) {
    case 1: { // Again
      const step = 0;
      const minutes = config.learningStepsMinutes[step] ?? 1;
      return {
        queue: "Learning",
        step,
        interval: 0,
        easeFactor: Math.max(config.minimumEaseFactor, current.easeFactor - 200),
        reps,
        lapses: current.lapses + 1,
        due: new Date(now.getTime() + minutes * 60 * 1000),
        lastReviewedAt: now,
      };
    }
    case 2: { // Hard
      const interval = Math.max(current.interval + 1, Math.round(current.interval * config.hardIntervalMultiplier));
      const easeFactor = Math.max(config.minimumEaseFactor, current.easeFactor - 150);
      return {
        queue: "Review",
        step: 0,
        interval,
        easeFactor,
        reps,
        lapses: current.lapses,
        due: new Date(now.getTime() + interval * 24 * 60 * 60 * 1000),
        lastReviewedAt: now,
      };
    }
    case 3: { // Good
      const factor = current.easeFactor / 1000;
      const interval = Math.max(current.interval + 1, Math.round(current.interval * factor));
      return {
        queue: "Review",
        step: 0,
        interval,
        easeFactor: current.easeFactor,
        reps,
        lapses: current.lapses,
        due: new Date(now.getTime() + interval * 24 * 60 * 60 * 1000),
        lastReviewedAt: now,
      };
    }
    case 4: { // Easy
      const factor = (current.easeFactor / 1000) * config.easyIntervalBonus;
      const interval = Math.max(current.interval + 1, Math.round(current.interval * factor));
      return {
        queue: "Review",
        step: 0,
        interval,
        easeFactor: current.easeFactor + 150,
        reps,
        lapses: current.lapses,
        due: new Date(now.getTime() + interval * 24 * 60 * 60 * 1000),
        lastReviewedAt: now,
      };
    }
  }
}

export function getIntervalEstimateLabel(
  current: CardScheduleState,
  rating: AnkiRating,
  now: Date = new Date(),
  customConfig?: Partial<ScheduleConfig>
): string {
  const next = calculateNextSchedule(current, rating, now, customConfig);
  if (next.interval > 0) {
    if (next.interval >= 365) {
      const years = (next.interval / 365).toFixed(1).replace(/\.0$/, "");
      return `${years}y`;
    }
    if (next.interval >= 60) {
      const months = (next.interval / 30).toFixed(1).replace(/\.0$/, "");
      return `${months}mo`;
    }
    return `${next.interval}d`;
  }

  const diffMs = next.due.getTime() - now.getTime();
  const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
  return `< ${minutes}m`;
}
