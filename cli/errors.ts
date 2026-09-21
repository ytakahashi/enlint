import { classifyJevError } from "#infra/jev/jev_evaluator.ts";
import { classifyOpenAiError } from "#infra/llm/openai_advisor.ts";

export class CliUsageError extends Error {
  override readonly name = "CliUsageError";
  readonly showHelp: boolean;

  constructor(message: string, options: { readonly showHelp?: boolean } = {}) {
    super(message);
    this.showHelp = options.showHelp ?? false;
  }
}

export class CliInputError extends Error {
  override readonly name = "CliInputError";
}

export class CliExecutionError extends Error {
  override readonly name = "CliExecutionError";
}

export function executionErrorMessage(error: unknown): string {
  if (error instanceof CliExecutionError) return error.message;

  switch (classifyJevError(error)) {
    case "authentication":
      return "Authentication failed. Check TYPESAFE_API_KEY.";
    case "rate-limit":
      return "The evaluation service is temporarily unavailable after retrying.";
    case "timeout":
      return "The evaluation service did not respond in time.";
    case "connection":
      return "Unable to reach the evaluation service. Check the network connection.";
  }

  return error instanceof Error
    ? `Evaluation failed: ${error.message}`
    : "Evaluation failed for an unknown reason.";
}

export function adviceErrorMessage(error: unknown): string {
  if (error instanceof CliExecutionError) return error.message;

  switch (classifyOpenAiError(error)) {
    case "authentication":
      return "OpenAI authentication failed. Check OPENAI_API_KEY.";
    case "rate-limit":
      return "The advice service is temporarily unavailable after retrying.";
    case "timeout":
      return "The advice service did not respond in time.";
    case "connection":
      return "Unable to reach the advice service. Check the network connection.";
  }

  return error instanceof Error
    ? `Advice failed: ${error.message}`
    : "Advice failed for an unknown reason.";
}
