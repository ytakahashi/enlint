import { CliInputError, CliUsageError } from "./errors.ts";

export type Stdin = {
  readonly isTerminal: () => boolean;
  readonly readText: () => Promise<string>;
};

export async function resolveInput(
  message: string | undefined,
  stdin: Stdin,
): Promise<string> {
  if (message !== undefined) {
    return message;
  }
  if (stdin.isTerminal()) {
    throw new CliUsageError("No message was provided.", { showHelp: true });
  }

  const input = removeTransportLineEnding(await stdin.readText());
  if (input.trim().length === 0) {
    throw new CliInputError("The input message must not be empty.");
  }
  return input;
}

function removeTransportLineEnding(input: string): string {
  // A single final line ending is normally added by pipe producers such as
  // `echo`; preserve every other character because message layout is relevant.
  return input.replace(/\r?\n$/, "");
}
