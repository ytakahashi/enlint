import { assertEquals, assertRejects } from "@std/assert";
import {
  CLEAR_LINE,
  createTerminalProgress,
  NO_PROGRESS,
  type Scheduler,
  track,
} from "./progress.ts";

/** A scheduler whose repeated callback runs only when the test ticks it. */
function manualScheduler() {
  let callback: (() => void) | undefined;
  let cancelled = 0;
  const scheduler: Scheduler = {
    repeat(next) {
      callback = next;
      return () => {
        cancelled++;
        callback = undefined;
      };
    },
  };
  return {
    scheduler,
    tick: () => callback?.(),
    cancelled: () => cancelled,
  };
}

function recordingWriter() {
  const writes: string[] = [];
  return {
    writes,
    writer: {
      write: (text: string) => {
        writes.push(text);
        return Promise.resolve();
      },
    },
  };
}

Deno.test("terminal progress redraws one line with each frame", async () => {
  const { writes, writer } = recordingWriter();
  const clock = manualScheduler();
  const progress = createTerminalProgress(writer, clock.scheduler).start(
    "Evaluating…",
  );

  clock.tick();
  clock.tick();
  await progress.stop();

  assertEquals(writes, [
    `${CLEAR_LINE}⠋ Evaluating…`,
    `${CLEAR_LINE}⠙ Evaluating…`,
    `${CLEAR_LINE}⠹ Evaluating…`,
    CLEAR_LINE,
  ]);
});

Deno.test("terminal progress stops drawing once cleared", async () => {
  const { writes, writer } = recordingWriter();
  const clock = manualScheduler();
  const progress = createTerminalProgress(writer, clock.scheduler).start(
    "Evaluating…",
  );

  await progress.stop();
  await progress.stop();
  clock.tick();

  assertEquals(writes, [`${CLEAR_LINE}⠋ Evaluating…`, CLEAR_LINE]);
  assertEquals(clock.cancelled(), 1);
});

Deno.test("terminal progress clears only after pending frames are written", async () => {
  const writes: string[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => release = resolve);
  const writer = {
    write: async (text: string) => {
      // Holds the first frame so the clear is requested while it is pending.
      if (writes.length === 0) await blocked;
      writes.push(text);
    },
  };
  const progress = createTerminalProgress(writer, manualScheduler().scheduler)
    .start("Evaluating…");

  const stopped = progress.stop();
  release();
  await stopped;

  assertEquals(writes, [`${CLEAR_LINE}⠋ Evaluating…`, CLEAR_LINE]);
});

Deno.test("terminal progress ignores write failures", async () => {
  const writer = { write: () => Promise.reject(new Error("closed")) };
  const progress = createTerminalProgress(writer, manualScheduler().scheduler)
    .start("Evaluating…");

  await progress.stop();
});

Deno.test("track clears the indicator whether the task settles or fails", async () => {
  const { writes, writer } = recordingWriter();
  const reporter = createTerminalProgress(writer, manualScheduler().scheduler);

  assertEquals(await track(reporter, "Working…", () => Promise.resolve(1)), 1);
  assertEquals(writes.at(-1), CLEAR_LINE);

  writes.length = 0;
  await assertRejects(
    () => track(reporter, "Working…", () => Promise.reject(new Error("x"))),
    Error,
    "x",
  );
  assertEquals(writes, [`${CLEAR_LINE}⠋ Working…`, CLEAR_LINE]);
});

Deno.test("NO_PROGRESS writes nothing", async () => {
  assertEquals(
    await track(NO_PROGRESS, "Working…", () => Promise.resolve(2)),
    2,
  );
});
