# Anki (.apkg) Import & Spaced Repetition System (SRS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full Anki package (`.apkg`) import (supporting modern Anki 2.1 zstd/protobuf and legacy Anki 2.0 formats), deck hierarchy preservation, local media serving, and an authentic Anki SM-2 Spaced Repetition study mode in Quenti.

**Architecture:** A standalone Anki parsing pipeline in `packages/lib/src/anki/` processes `.apkg` files into hierarchical Quenti `Folder` and `StudySet` structures with rendered card templates and media files. An `AnkiCardSchedule` model in Prisma tracks SM-2 card intervals, ease factors, repetitions, and due dates. A dedicated tRPC `anki` router manages the review queue and rating submissions. Next.js pages provide the `/api/anki/media/` streaming endpoint, a web import modal, and a dedicated `/[id]/anki` study interface with full audio, images, cloze styling, and 4-button rating controls.

**Tech Stack:** TypeScript, Next.js, tRPC, Prisma (MySQL), Chakra UI, Zstandard (Node / Python runner for native zstd/protobuf extraction), SQLite (better-sqlite3 / sqlite3), Jest.

**Spec:** [`docs/superpowers/specs/2026-10-15-anki-import-and-srs-design.md`](file:///f:/Quenti/docs/superpowers/specs/2026-10-15-anki-import-and-srs-design.md)

---

## Global Constraints

- Modern `.apkg` packages (`collection.anki21b` with Zstandard compression and Protobuf media mapping) must be supported without failing on custom SQLite collations (`unicase`).
- Legacy `.apkg` packages (`collection.anki2` with JSON models/decks and JSON media dictionary) must also remain fully supported.
- Deck names containing `::` (e.g. `4000 Essential English Words::1.Book`) must split into a root `Folder` and sub-deck `StudySet`s.
- SM-2 ease factor must never drop below the minimum threshold of 1300 (130%).
- All audio tags `[sound:filename.mp3]` and image tags `<img src="filename.jpg">` must resolve to accessible Quenti media paths (`/api/anki/media/...` or `/uploads/anki/...`).
- Ratings 1 to 4 must map exactly to: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.

---

## Review Focus

1. **Intraday learning step intervals:** Learning cards graded Again or Good on initial steps must schedule due times in minutes (`now + 1m`, `now + 10m`) rather than advancing full days prematurely.
2. **Ease factor lower bound:** Consecutive `Again` failures must clamp `easeFactor` to minimum 1300 instead of decreasing toward zero or negative numbers.
3. **Template missing field conditionals:** Templates with conditional wrappers `{{#Field}}...{{/Field}}` and `{{^Field}}...{{/Field}}` must gracefully omit or show content when the field is empty or missing.
4. **Multiple Cloze deletion indices:** Notes containing `{{c1::...}}` and `{{c2::...}}` must generate separate cards for each cloze ordinal with non-targeted clozes rendered as normal text.
5. **Massive media package extraction:** Packages with >10,000 files (such as `All Decks.apkg` with 14,955 files) must extract and stream efficiently without exceeding memory or timing out.

---

### Task 1: Anki SM-2 Spaced Repetition Scheduling Engine

**Files:**
- Create: `packages/lib/src/anki/srs.ts`
- Test: `tests/anki-srs.test.ts`

**Interfaces:**
- Produces:
  ```ts
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

  export function calculateNextSchedule(
    current: CardScheduleState,
    rating: AnkiRating,
    now?: Date,
    config?: Partial<ScheduleConfig>
  ): CardScheduleState;

  export function getIntervalEstimateLabel(
    current: CardScheduleState,
    rating: AnkiRating,
    now?: Date,
    config?: Partial<ScheduleConfig>
  ): string;
  ```

- [ ] **Step 1: Write the failing test**
  Write tests in `tests/anki-srs.test.ts` checking:
  - New card graded Good advances step 0 -> step 1 (`10m`).
  - New card graded Good at final step graduates to Review (`1d`).
  - Review card graded Again resets to step 0, lapses increment, interval 1m, easeFactor reduced by 200, clamped at 1300.
  - Review card graded Good multiplies interval by `easeFactor / 1000`.
  - Review card graded Easy multiplies interval by `easeFactor / 1000 * 1.3` and increases easeFactor by 150.
  - `getIntervalEstimateLabel` outputs formatted strings: `"< 10m"`, `"1d"`, `"4d"`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- tests/anki-srs.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `packages/lib/src/anki/srs.ts`**
  Implement SM-2 scheduling rules, queue transitions, ease factor clamping (minimum 1300), and interval humanizers.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- tests/anki-srs.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/lib/src/anki/srs.ts tests/anki-srs.test.ts
  git commit -m "feat(anki): add SM-2 spaced repetition scheduling engine"
  ```

---

### Task 2: Anki Template & Cloze Parsing Engine

**Files:**
- Create: `packages/lib/src/anki/template.ts`
- Test: `tests/anki-template.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RenderCardOptions {
    qfmt: string;                          // Front template
    afmt: string;                          // Back template
    fields: Record<string, string>;        // Field name -> content
    clozeOrdinal?: number;                 // e.g. 1 for c1, 2 for c2
    mediaUrlPrefix?: string;               // e.g. "/api/anki/media/setId"
  }

  export interface RenderedCard {
    questionHtml: string;
    answerHtml: string;
    audioFiles: string[];
    imageFiles: string[];
  }

  export function renderAnkiCard(options: RenderCardOptions): RenderedCard;
  export function extractClozeOrdinals(text: string): number[];
  export function sanitizeAnkiHtml(html: string, mediaUrlPrefix?: string): {
    html: string;
    audioFiles: string[];
    imageFiles: string[];
  };
  ```

- [ ] **Step 1: Write the failing test**
  Write tests in `tests/anki-template.test.ts` checking:
  - `{{Word}}` replacement with note field value.
  - `{{#Field}}content{{/Field}}` renders when Field is non-empty, omitted when empty.
  - `{{^Field}}fallback{{/Field}}` renders when Field is empty.
  - `{{cloze:Text}}` with `{{c1::apple::fruit}}` shows `[fruit]` on front, `<span class="anki-cloze">apple</span>` on back.
  - `[sound:audio.mp3]` extracted into audioFiles and replaced with `<div data-anki-sound="audio.mp3"></div>`.
  - `<img src="pic.jpg">` transformed with `mediaUrlPrefix`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- tests/anki-template.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `packages/lib/src/anki/template.ts`**
  Implement template tag parser, regex substitutions, cloze replacers, and audio tag extractors.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- tests/anki-template.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/lib/src/anki/template.ts tests/anki-template.test.ts
  git commit -m "feat(anki): add template and cloze rendering engine"
  ```

---

### Task 3: Dual-Mode Anki Archive (.apkg) Extractor & Parser

**Files:**
- Create: `packages/lib/src/anki/parser.ts`
- Create: `packages/lib/src/anki/protobuf-media.ts`
- Test: `tests/anki-parser.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedDeck {
    id: string;
    name: string;
    parentName?: string;
    cards: ParsedCard[];
  }

  export interface ParsedCard {
    id: string;
    noteId: string;
    deckId: string;
    front: string;
    back: string;
    rawFields: Record<string, string>;
    audioFiles: string[];
    imageFiles: string[];
    tags: string[];
    srs?: {
      queue: number;
      interval: number;
      factor: number;
      reps: number;
      lapses: number;
      due: number;
    };
  }

  export interface ParseApkgResult {
    decks: ParsedDeck[];
    mediaMap: Record<string, string>; // zipEntryName -> originalFilename
  }

  export function parseAnkiPackage(apkgBuffer: Buffer | string): Promise<ParseApkgResult>;
  export function decodeProtobufMedia(buffer: Buffer): Record<string, string>;
  ```

- [ ] **Step 1: Write the failing test**
  Write tests in `tests/anki-parser.test.ts` checking:
  - Protobuf media decoder extracts entry id -> filename mapping.
  - JSON media decoder extracts legacy entry id -> filename mapping.
  - Deck hierarchy parsing splits `Parent::Child` into nested deck structures.
  - Extraction handles modern `.anki21b` and fallback `.anki2`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- tests/anki-parser.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement parser modules**
  - Implement `packages/lib/src/anki/protobuf-media.ts` using protobuf wire-type decoding.
  - Implement `packages/lib/src/anki/parser.ts` reading zip entries, decompressing zstd if present, connecting to SQLite with `unicase` collation, querying `decks`, `notetypes`, `fields`, `templates`, `notes`, `cards`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- tests/anki-parser.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/lib/src/anki/parser.ts packages/lib/src/anki/protobuf-media.ts tests/anki-parser.test.ts
  git commit -m "feat(anki): add dual-format .apkg parser and protobuf media decoder"
  ```

---

### Task 4: Prisma Schema Update & Database Migration

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/add_anki_srs/` (or run `prisma db:push`)

**Schema Change:**
Add `AnkiCardSchedule` model and relations to `User`, `Term`, and `StudySet`:
```prisma
enum AnkiCardQueue {
  New
  Learning
  Review
  DayLearn
  Suspended
}

model AnkiCardSchedule {
  id             String        @id @default(cuid())
  userId         String
  termId         String
  studySetId     String
  queue          AnkiCardQueue @default(New)
  step           Int           @default(0)
  interval       Int           @default(0)
  easeFactor     Int           @default(2500)
  reps           Int           @default(0)
  lapses         Int           @default(0)
  due            DateTime      @default(now())
  lastReviewedAt DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  term     Term     @relation(fields: [termId], references: [id], onDelete: Cascade)
  studySet StudySet @relation(fields: [studySetId], references: [id], onDelete: Cascade)

  @@unique([userId, termId])
  @@index([userId, studySetId, due, queue])
}
```

- [ ] **Step 1: Update `packages/prisma/schema.prisma`**
  Add the enum `AnkiCardQueue` and model `AnkiCardSchedule`, with reverse relations in `User`, `Term`, and `StudySet`.

- [ ] **Step 2: Generate Prisma Client**
  Run: `npx prisma generate --schema packages/prisma/schema.prisma`
  Expected: Generation succeeds without schema validation errors.

- [ ] **Step 3: Commit**
  ```bash
  git add packages/prisma/schema.prisma
  git commit -m "feat(prisma): add AnkiCardSchedule model for spaced repetition"
  ```

---

### Task 5: tRPC Router for Anki Spaced Repetition & Media API

**Files:**
- Create: `packages/trpc/server/routers/anki/_router.ts`
- Create: `packages/trpc/server/routers/anki/get-review-queue.handler.ts`
- Create: `packages/trpc/server/routers/anki/submit-review.handler.ts`
- Create: `packages/trpc/server/routers/anki/import-package.handler.ts`
- Modify: `packages/trpc/server/routers/_app.ts`
- Create: `apps/next/src/pages/api/anki/media/[...path].ts`
- Test: `tests/anki-trpc.test.ts`

**Interfaces:**
- Produces tRPC procedures:
  - `anki.getReviewQueue({ studySetId: string })`: returns `{ cards: DueCard[], counts: { new: number, learn: number, review: number } }`
  - `anki.submitReview({ termId: string, studySetId: string, rating: 1 | 2 | 3 | 4 })`: updates `AnkiCardSchedule` with SM-2 result and returns `{ nextDue: Date, interval: number }`
  - `anki.importPackage({ fileBase64: string, filename: string })`: imports deck into Folders/StudySets.
- Produces API route:
  - `GET /api/anki/media/[setId]/[filename]`: streams audio and image assets from local storage `public/uploads/anki/[setId]/[filename]`.

- [ ] **Step 1: Write the failing test**
  Write tests in `tests/anki-trpc.test.ts` verifying `getReviewQueue` ordering and `submitReview` state persistence.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- tests/anki-trpc.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement handlers and media endpoint**
  - Implement `get-review-queue.handler.ts` (querying learning, review, and new cards).
  - Implement `submit-review.handler.ts` using `calculateNextSchedule` from Task 1.
  - Implement media streaming route in `apps/next/src/pages/api/anki/media/[...path].ts`.
  - Wire `ankiRouter` into `packages/trpc/server/routers/_app.ts`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- tests/anki-trpc.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/trpc/ apps/next/src/pages/api/anki/ tests/anki-trpc.test.ts
  git commit -m "feat(api): implement anki tRPC router and media streaming endpoint"
  ```

---

### Task 6: CLI Bulk Importer Script

**Files:**
- Create: `scripts/import-anki.ts`

**Responsibilities:**
- Command line execution: `bun run scripts/import-anki.ts <path-to-apkg> [--userId <userId>] [--mediaDir <dir>]`
- Fast extraction for large collections like `All Decks.apkg` (212MB, 14,900+ media files, 3,873 cards).
- Maps `Parent::Child` decks to Quenti `Folder` and `StudySet` rows.
- Extracts all media into `public/uploads/anki/[studySetId]/`.
- Batch creates `Term` and initial `AnkiCardSchedule` entries.

- [ ] **Step 1: Implement `scripts/import-anki.ts`**
  Write script using the parser from Task 3 and streaming file writes to avoid memory spikes.

- [ ] **Step 2: Test script on sample deck**
  Run: `npx ts-node scripts/import-anki.ts "All Decks.apkg" --dry-run`
  Expected: Successfully logs deck hierarchy, total notes, cards, and media mapping without errors.

- [ ] **Step 3: Commit**
  ```bash
  git add scripts/import-anki.ts
  git commit -m "feat(scripts): add high-performance CLI Anki package importer"
  ```

---

### Task 7: Web Import UI Modal

**Files:**
- Create: `apps/next/src/components/import-from-anki-modal.tsx`
- Modify: `apps/next/src/modules/create/components/create-header.tsx`
- Modify: `apps/next/src/components/navbar.tsx`

**Responsibilities:**
- Provides a clean Chakra UI modal for selecting/dropping `.apkg` files.
- Displays upload/processing spinner with friendly progress messages.
- On success, redirects to the newly created set or folder and triggers confetti effect.

- [ ] **Step 1: Implement `apps/next/src/components/import-from-anki-modal.tsx`**
  Build modal adhering to Quenti's design system (`@quenti/components/modal`, Chakra UI, file input, error handling).

- [ ] **Step 2: Add trigger button in create navigation**
  Add "Import from Anki" alongside "Import from Quizlet" in create dropdowns.

- [ ] **Step 3: Commit**
  ```bash
  git add apps/next/src/components/import-from-anki-modal.tsx apps/next/
  git commit -m "feat(ui): add Import from Anki modal and navigation triggers"
  ```

---

### Task 8: Authentic Anki Spaced Repetition Study UI (`/[id]/anki.tsx`)

**Files:**
- Create: `apps/next/src/pages/[id]/anki.tsx`
- Create: `apps/next/src/modules/anki/anki-study-view.tsx`
- Create: `apps/next/src/modules/anki/anki-card.tsx`
- Create: `apps/next/src/modules/anki/anki-rating-bar.tsx`
- Create: `apps/next/src/modules/anki/anki-audio-player.tsx`
- Modify: `apps/next/src/modules/main/subheaders/view-set.tsx` (add "Anki SRS" study mode button)

**Responsibilities:**
- Renders the card front with HTML formatting, images, and audio playback.
- Pressing `Space` or clicking "Show Answer" flips the card to reveal the back.
- Audio auto-plays on flip if enabled; hotkey `R` replays audio.
- Bottom rating bar shows 4 buttons: Again (`1`), Hard (`2`), Good (`3`), Easy (`4`) with dynamic interval labels (e.g. `< 10m`, `1d`, `4d`).
- Top counter displays remaining New (blue), Learn (red), and Due (green) cards.
- When deck is complete, shows "Congratulations! You have finished studying this deck for now."

- [ ] **Step 1: Implement UI components in `apps/next/src/modules/anki/`**
  Build `anki-card.tsx`, `anki-audio-player.tsx`, `anki-rating-bar.tsx`, and `anki-study-view.tsx`.

- [ ] **Step 2: Implement page route `apps/next/src/pages/[id]/anki.tsx`**
  Wire tRPC queries (`anki.getReviewQueue`) and mutations (`anki.submitReview`).

- [ ] **Step 3: Add "Anki SRS" study button in set header**
  Link to `/[id]/anki` in the set study mode bar alongside Flashcards and Learn.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/next/src/pages/[id]/anki.tsx apps/next/src/modules/anki/
  git commit -m "feat(ui): implement Anki SRS study mode page and interactive rating bar"
  ```

---

### Task 9: End-to-End Verification with `All Decks.apkg`

**Files:**
- Test: `tests/e2e-anki-import.test.ts`

**Verification Steps:**
- [ ] **Step 1: Run parser verification on `All Decks.apkg`**
  Verify extraction of all 8 sub-decks (`4000 Essential English Words 1.Book` through `6.Book` + `Extra`), 3,873 notes, 3,873 cards, and media mapping.
- [ ] **Step 2: Verify audio and image rendering**
  Verify that audio filenames and image paths are correctly transformed and playable.
- [ ] **Step 3: Verify SM-2 review transitions**
  Simulate review sessions across all 4 rating buttons and verify interval progressions.
- [ ] **Step 4: Commit**
  ```bash
  git add tests/e2e-anki-import.test.ts
  git commit -m "test(anki): add end-to-end verification for All Decks.apkg"
  ```

---
