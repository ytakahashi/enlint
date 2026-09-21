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
  if (error instanceof CliExecutionError) {
    return error.message;
  }

  if (hasStatusCode(error, 401)) {
    return "Authentication failed. Check AI_GATEWAY_API_KEY.";
  }
  if (hasStatusCode(error, 429) || hasServerStatusCode(error)) {
    return "The evaluation service is temporarily unavailable after retrying.";
  }
  if (isTimeoutError(error)) {
    return "The evaluation service did not respond in time.";
  }
  if (isNetworkError(error)) {
    return "Unable to reach the evaluation service. Check the network connection.";
  }

  return error instanceof Error
    ? `Evaluation failed: ${error.message}`
    : "Evaluation failed for an unknown reason.";
}

export function adviceErrorMessage(error: unknown): string {
  if (error instanceof CliExecutionError) {
    return error.message;
  }

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

function hasStatusCode(error: unknown, expected: number): boolean {
  return statusCode(error) === expected;
}

function hasServerStatusCode(error: unknown): boolean {
  const status = statusCode(error);
  return status !== undefined && status >= 500 && status <= 599;
}

function statusCode(error: unknown): number | undefined {
  for (const item of errorChain(error)) {
    for (const key of ["statusCode", "status"] as const) {
      const value = Reflect.get(item, key);
      if (typeof value === "number") {
        return value;
      }
    }
  }
  return undefined;
}

function isTimeoutError(error: unknown): boolean {
  return errorChain(error).some((item) =>
    item instanceof Error && item.name === "JevRequestTimeoutError"
  );
}

function isNetworkError(error: unknown): boolean {
  return errorChain(error).some((item) => {
    if (
      item instanceof Error &&
      item.message.toLowerCase().includes("fetch failed")
    ) {
      return true;
    }
    const code = Reflect.get(item, "code");
    return typeof code === "string" && NETWORK_ERROR_CODES.has(code);
  });
}

function errorChain(error: unknown): readonly object[] {
  const chain: object[] = [];
  const seen = new Set<object>();
  let current = error;
  while (
    typeof current === "object" && current !== null && !seen.has(current)
  ) {
    seen.add(current);
    chain.push(current);
    current = Reflect.get(current, "cause");
  }
  return chain;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);
