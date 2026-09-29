import type { TextWriter } from "./text_writer.ts";

/**
 * Runs a callback repeatedly until the returned function cancels it. Injected
 * so tests can advance the indicator by hand.
 */
export type Scheduler = {
  readonly repeat: (callback: () => void, ms: number) => () => void;
};

export type Progress = {
  /** Clears the indicator line. Safe to call more than once. */
  readonly stop: () => Promise<void>;
};

export type ProgressReporter = {
  readonly start: (label: string) => Progress;
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;
/** Returns to the start of the line and erases it. */
export const CLEAR_LINE = "\r\u001b[2K";

export const NO_PROGRESS: ProgressReporter = {
  start: () => ({ stop: () => Promise.resolve() }),
};

/**
 * Redraws a spinner in place on one terminal line. It must only write to a
 * terminal: the carriage return and erase sequence would corrupt a file or
 * pipe. The cursor stays visible, so an interrupted run needs no cleanup
 * beyond the line left behind.
 */
export function createTerminalProgress(
  writer: TextWriter,
  scheduler: Scheduler,
): ProgressReporter {
  return {
    start(label) {
      // Writes are asynchronous; chaining them keeps a late frame from being
      // drawn after the line has been cleared.
      let written = Promise.resolve();
      const enqueue = (text: string) => {
        written = written
          .then(() => writer.write(text))
          // The indicator is cosmetic, so a failed write must not fail the run.
          .catch(() => {});
      };

      let frame = 0;
      const draw = () => {
        enqueue(`${CLEAR_LINE}${FRAMES[frame % FRAMES.length]} ${label}`);
        frame++;
      };
      draw();
      const cancel = scheduler.repeat(draw, FRAME_INTERVAL_MS);

      let stopped = false;
      return {
        stop() {
          if (!stopped) {
            stopped = true;
            cancel();
            enqueue(CLEAR_LINE);
          }
          return written;
        },
      };
    },
  };
}

/**
 * Shows the indicator while a task runs. It is cleared before this resolves or
 * rejects, so the caller's next write starts on a clean line.
 */
export async function track<T>(
  reporter: ProgressReporter,
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const progress = reporter.start(label);
  try {
    return await task();
  } finally {
    await progress.stop();
  }
}
