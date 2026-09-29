import {
  type AdviceOutcome,
  adviseLintResult,
  type Advisor,
  BUILT_IN_CONTEXT_PROFILE_IDS,
  type ContextProfile,
  type Evaluator,
  getBuiltInContextProfile,
  isAdvisable,
  lintMessage,
  type LintResult,
} from "#core/mod.ts";
import { HELP_TEXT, parseArgs } from "./args.ts";
import {
  adviceErrorMessage,
  CliExecutionError,
  CliInputError,
  CliUsageError,
  executionErrorMessage,
} from "./errors.ts";
import { formatJson } from "./format/json.ts";
import { formatAdviceText, formatLintText } from "./format/text.ts";
import { resolveInput, type Stdin } from "./input.ts";
import {
  createTerminalProgress,
  NO_PROGRESS,
  type Scheduler,
  track,
} from "./progress.ts";
import type { TextWriter } from "./text_writer.ts";

export type { TextWriter };

export type RunDependencies = {
  readonly evaluator: Evaluator;
  readonly advisor: Advisor;
  readonly stdin: Stdin;
  readonly stdout: TextWriter & {
    readonly isTerminal: () => boolean;
  };
  readonly stderr: TextWriter & {
    readonly isTerminal: () => boolean;
  };
  readonly scheduler: Scheduler;
  readonly getEnv: (name: string) => string | undefined;
  readonly version: string;
};

export async function run(
  args: readonly string[],
  dependencies: RunDependencies,
): Promise<number> {
  try {
    const command = parseArgs(args);
    if (command.kind === "help") {
      await dependencies.stdout.write(`${HELP_TEXT}\n`);
      return 0;
    }
    if (command.kind === "version") {
      await dependencies.stdout.write(`enlint ${dependencies.version}\n`);
      return 0;
    }

    const profile = getBuiltInContextProfile(command.contextId);
    if (profile === undefined) {
      throw new CliUsageError(
        `Unknown context "${command.contextId}". Available contexts: ${
          BUILT_IN_CONTEXT_PROFILE_IDS.join(", ")
        }.`,
      );
    }
    const text = await resolveInput(command.message, dependencies.stdin);
    requireCredentials(dependencies.getEnv);

    // The indicator redraws its line with control sequences, so it is shown
    // only on a terminal. stdout may still be redirected: the indicator is
    // cleared before anything is written to either stream.
    const progress = dependencies.stderr.isTerminal()
      ? createTerminalProgress(dependencies.stderr, dependencies.scheduler)
      : NO_PROGRESS;
    const result = await track(
      progress,
      "Evaluating…",
      () => lintMessage({ text, profile }, dependencies.evaluator),
    );
    const textOptions = {
      // https://no-color.org: NO_COLOR disables color when present and not
      // empty, so an empty value must leave color enabled.
      color: dependencies.stdout.isTerminal() && !command.noColor &&
        (dependencies.getEnv("NO_COLOR") ?? "") === "",
    };
    // Text is written before advice is requested so the lint result is readable
    // while advice is generated. JSON waits for advice: stdout is written only
    // after serialization succeeds, so a failure never leaves partial JSON.
    if (command.output === "text") {
      await dependencies.stdout.write(formatLintText(result, textOptions));
    }

    const advice = command.lintOnly || !isAdvisable(result)
      ? { outcome: undefined, notice: undefined }
      : await track(
        progress,
        "Generating advice…",
        () => requestAdvice(result, profile, dependencies),
      );
    if (command.output === "json") {
      await dependencies.stdout.write(
        formatJson({ lintResult: result, advice: advice.outcome }),
      );
    } else if (advice.outcome !== undefined) {
      await dependencies.stdout.write(
        formatAdviceText(result, advice.outcome, textOptions),
      );
    }
    if (advice.notice !== undefined) {
      await dependencies.stderr.write(`enlint: ${advice.notice}\n`);
    }

    return command.minScore !== undefined &&
        result.overallScore < command.minScore
      ? 1
      : 0;
  } catch (error) {
    if (error instanceof CliUsageError) {
      const help = error.showHelp ? `\n\n${HELP_TEXT}` : "";
      await dependencies.stderr.write(`enlint: ${error.message}${help}\n`);
      return 2;
    }
    if (error instanceof CliInputError) {
      await dependencies.stderr.write(`enlint: ${error.message}\n`);
      return 2;
    }

    await dependencies.stderr.write(
      `enlint: ${executionErrorMessage(error)}\n`,
    );
    return 2;
  }
}

type AdviceAttempt = {
  readonly outcome: AdviceOutcome | undefined;
  /** Why advice is missing, for stderr. */
  readonly notice: string | undefined;
};

/**
 * Advice complements the lint result, so neither a missing key nor a failed
 * request fails the run: lint output and the exit status are kept.
 */
async function requestAdvice(
  lintResult: LintResult,
  profile: ContextProfile,
  dependencies: RunDependencies,
): Promise<AdviceAttempt> {
  const apiKey = dependencies.getEnv("OPENAI_API_KEY");
  if (apiKey === undefined || apiKey.trim().length === 0) {
    return {
      outcome: undefined,
      notice:
        "Set OPENAI_API_KEY to get explanations and rewrites, or pass --lint-only to skip them.",
    };
  }

  try {
    return {
      outcome: await adviseLintResult(
        { lintResult, profile, kind: "both" },
        dependencies.advisor,
      ),
      notice: undefined,
    };
  } catch (error) {
    return { outcome: undefined, notice: adviceErrorMessage(error) };
  }
}

function requireCredentials(
  getEnv: (name: string) => string | undefined,
): void {
  const apiKey = getEnv("TYPESAFE_API_KEY");
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new CliExecutionError(
      "Set TYPESAFE_API_KEY before running an evaluation.",
    );
  }
}
