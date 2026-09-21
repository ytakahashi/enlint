import {
  BUILT_IN_CONTEXT_PROFILE_IDS,
  type Evaluator,
  getBuiltInContextProfile,
  lintMessage,
} from "#core/mod.ts";
import { HELP_TEXT, parseArgs } from "./args.ts";
import {
  CliExecutionError,
  CliInputError,
  CliUsageError,
  executionErrorMessage,
} from "./errors.ts";
import { formatJson } from "./format/json.ts";
import { formatText } from "./format/text.ts";
import { resolveInput, type Stdin } from "./input.ts";

export type TextWriter = {
  readonly write: (text: string) => Promise<void>;
};

export type RunDependencies = {
  readonly evaluator: Evaluator;
  readonly stdin: Stdin;
  readonly stdout: TextWriter & {
    readonly isTerminal: () => boolean;
  };
  readonly stderr: TextWriter;
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
    const result = await lintMessage({ text, profile }, dependencies.evaluator);
    const output = command.output === "json"
      ? formatJson(result)
      : formatText(result, {
        // https://no-color.org: NO_COLOR disables color when present and not
        // empty, so an empty value must leave color enabled.
        color: dependencies.stdout.isTerminal() && !command.noColor &&
          (dependencies.getEnv("NO_COLOR") ?? "") === "",
      });

    // Delay stdout until evaluation and serialization have succeeded, so
    // application failures cannot emit a partial JSON document.
    await dependencies.stdout.write(output);
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

function requireCredentials(
  getEnv: (name: string) => string | undefined,
): void {
  const apiKey = getEnv("AI_GATEWAY_API_KEY");
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new CliExecutionError(
      "Set AI_GATEWAY_API_KEY before running an evaluation.",
    );
  }
}
