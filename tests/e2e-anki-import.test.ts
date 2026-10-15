import * as path from "path";
import * as fs from "fs";
import { parseAnkiPackage } from "../packages/lib/src/anki/parser";
import { calculateNextSchedule, getIntervalEstimateLabel, CardScheduleState } from "../packages/lib/src/anki/srs";

describe("E2E Anki Import & Feature Parity Verification", () => {
  const apkgPath = path.resolve(__dirname, "../All Decks.apkg");

  test("Step 1: Successfully parse All Decks.apkg with 8 decks, 3873 cards, and media dictionary", async () => {
    expect(fs.existsSync(apkgPath)).toBe(true);

    const result = await parseAnkiPackage(apkgPath, {
      mediaUrlPrefix: "/api/anki/media/test_set",
    });

    // 1. Verify deck counts and names
    expect(result.decks.length).toBe(8);
    const deckNames = result.decks.map((d) => d.name);
    expect(deckNames).toContain("4000 Essential English Words::1.Book");
    expect(deckNames).toContain("4000 Essential English Words::2.Book");
    expect(deckNames).toContain("4000 Essential English Words::3.Book");
    expect(deckNames).toContain("4000 Essential English Words::4.Book");
    expect(deckNames).toContain("4000 Essential English Words::5.Book");
    expect(deckNames).toContain("4000 Essential English Words::6.Book");
    expect(deckNames).toContain("4000 Essential English Words::Extra");

    // 2. Verify total card count
    const totalCards = result.decks.reduce((sum, d) => sum + d.cards.length, 0);
    expect(totalCards).toBe(3873);

    // 3. Verify media mapping count (14951 files in All Decks.apkg)
    const mediaCount = Object.keys(result.mediaMap).length;
    expect(mediaCount).toBe(14951);
  });

  test("Step 2: Verify audio and image rendering in cards", async () => {
    const result = await parseAnkiPackage(apkgPath, {
      mediaUrlPrefix: "/api/anki/media/test_set",
    });

    const book1 = result.decks.find((d) => d.name.includes("1.Book"));
    expect(book1).toBeDefined();

    // Check sample cards in Book 1
    const cardsWithAudio = book1!.cards.filter((c) => c.audioFiles.length > 0);
    expect(cardsWithAudio.length).toBeGreaterThan(500);

    const cardsWithImages = book1!.cards.filter((c) => c.imageFiles.length > 0);
    expect(cardsWithImages.length).toBeGreaterThan(500);

    const sample = book1!.cards[0];
    expect(sample.front).toContain("data-anki-sound=");
    expect(sample.back).toContain('class="anki-img"');
    expect(sample.back).toContain("/api/anki/media/test_set/");
  });

  test("Step 3: Verify Anki SM-2 Spaced Repetition simulation over 4 review cycles", () => {
    const now = new Date("2026-10-15T12:00:00Z");

    // Start with a new card
    let card: CardScheduleState = {
      queue: "New",
      step: 0,
      interval: 0,
      easeFactor: 2500,
      reps: 0,
      lapses: 0,
      due: now,
      lastReviewedAt: null,
    };

    // Cycle 1: Rate Good (3) on first step -> moves to step 1 (10m)
    card = calculateNextSchedule(card, 3, now);
    expect(card.queue).toBe("Learning");
    expect(card.step).toBe(1);
    expect(card.reps).toBe(1);
    expect(getIntervalEstimateLabel(card, 3, now)).toBe("1d");

    // Cycle 2: Rate Good (3) on final step -> graduates to Review with 1 day interval
    card = calculateNextSchedule(card, 3, card.due);
    expect(card.queue).toBe("Review");
    expect(card.interval).toBe(1);
    expect(card.reps).toBe(2);

    // Cycle 3: Next day, review card and rate Good (3) -> interval becomes 1 * 2.5 = 3 days
    const day2 = new Date(card.due);
    card = calculateNextSchedule(card, 3, day2);
    expect(card.queue).toBe("Review");
    expect(card.interval).toBe(3); // Math.round(1 * 2.5) = 3
    expect(card.reps).toBe(3);

    // Cycle 4: User forgets and rates Again (1) -> card lapses, resets to learning, ease drops to 2300
    const day5 = new Date(card.due);
    card = calculateNextSchedule(card, 1, day5);
    expect(card.queue).toBe("Learning");
    expect(card.step).toBe(0);
    expect(card.lapses).toBe(1);
    expect(card.easeFactor).toBe(2300);
    expect(getIntervalEstimateLabel(card, 1, day5)).toBe("< 1m");
  });
});
