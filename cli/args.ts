import { parseArgs as parseStdArgs } from "@std/cli";
import { CliUsageError } from "./errors.ts";

export type OutputFormat = "text" | "json";

export type CliCommand =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | {
    readonly kind: "lint";
    readonly message: string | undefined;
    readonly contextId: string;
    readonly output: OutputFormat;
    readonly minScore: number | undefined;
    readonly noColor: boolean;
  };

export const HELP_TEXT = `Usage: enlint [options] [message]

Lint an English message supplied as an argument or through stdin.

Options:
  --context <id>       Evaluation context (default: general)
  --output <text|json> Output format (default: text)
  --min-score <0-100>  Exit 1 when the overall score is below this value
  --no-color           Disable colored output
  --help               Show this help
  --version            Show the version`;

export function parseArgs(args: readonly string[]): CliCommand {
  const parsed = parseStdArgs(args, {
    string: ["context", "output", "min-score"],
    boolean: ["no-color", "help", "version"],
    default: {
      context: "general",
      output: "text",
    },
    unknown(argument, key) {
      if (key !== undefined) {
        throw new CliUsageError(`Unknown option: ${argument}`);
      }
      return true;
    },
  });

  if (parsed.help) {
    return { kind: "help" };
  }
  if (parsed.version) {
    return { kind: "version" };
  }
  if (parsed._.length > 1) {
    throw new CliUsageError("Expected at most one message argument.");
  }

  // parseArgs coerces numeric-looking positional values even though process
  // arguments are strings, so restore the original CLI contract here.
  const message = parsed._[0] === undefined ? undefined : String(parsed._[0]);
  if (message !== undefined && message.trim().length === 0) {
    throw new CliUsageError("The message argument must not be empty.");
  }

  const output = parsed.output;
  if (output !== "text" && output !== "json") {
    throw new CliUsageError('--output must be either "text" or "json".');
  }

  return {
    kind: "lint",
    message,
    contextId: requireNonEmptyOption(parsed.context, "--context"),
    output,
    minScore: parseMinScore(parsed["min-score"]),
    noColor: parsed["no-color"],
  };
}

function requireNonEmptyOption(value: string, option: string): string {
  if (value.trim().length === 0) {
    throw new CliUsageError(`${option} requires a value.`);
  }
  return value;
}

function parseMinScore(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new CliUsageError("--min-score requires a value.");
  }

  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new CliUsageError("--min-score must be a number from 0 to 100.");
  }
  return score;
}
