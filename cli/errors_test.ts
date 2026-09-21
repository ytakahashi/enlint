import { assertEquals } from "@std/assert";
import {
  OpenAiAuthenticationError,
  OpenAiConnectionError,
  OpenAiRateLimitError,
  OpenAiTimeoutError,
} from "#infra/llm/openai_advisor.ts";
import {
  adviceErrorMessage,
  CliExecutionError,
  executionErrorMessage,
} from "./errors.ts";

Deno.test("executionErrorMessage preserves deliberate CLI errors", () => {
  assertEquals(
    executionErrorMessage(new CliExecutionError("Set a credential.")),
    "Set a credential.",
  );
});

Deno.test("executionErrorMessage maps service status codes through causes", () => {
  assertEquals(
    executionErrorMessage(new Error("request", { cause: { statusCode: 401 } })),
    "Authentication failed. Check AI_GATEWAY_API_KEY.",
  );
  assertEquals(
    executionErrorMessage(new Error("request", { cause: { status: 503 } })),
    "The evaluation service is temporarily unavailable after retrying.",
  );
});

Deno.test("executionErrorMessage maps timeout and network failures", () => {
  const timeout = new Error("deadline");
  timeout.name = "JevRequestTimeoutError";
  assertEquals(
    executionErrorMessage(timeout),
    "The evaluation service did not respond in time.",
  );
  assertEquals(
    executionErrorMessage(
      new Error("request", { cause: { code: "ENETUNREACH" } }),
    ),
    "Unable to reach the evaluation service. Check the network connection.",
  );
});

Deno.test("executionErrorMessage handles cyclic causes", () => {
  const error = new Error("gateway unavailable");
  Object.defineProperty(error, "cause", { value: error });

  assertEquals(
    executionErrorMessage(error),
    "Evaluation failed: gateway unavailable",
  );
});

Deno.test("adviceErrorMessage distinguishes deliberate and provider failures", () => {
  assertEquals(
    adviceErrorMessage(new CliExecutionError("Set OPENAI_API_KEY.")),
    "Set OPENAI_API_KEY.",
  );
  assertEquals(
    adviceErrorMessage(new Error("provider unavailable")),
    "Advice failed: provider unavailable",
  );
  assertEquals(
    adviceErrorMessage("unknown"),
    "Advice failed for an unknown reason.",
  );
});

Deno.test("adviceErrorMessage maps classified OpenAI failures", () => {
  const cause = new Error("SDK failure");
  const cases = [
    {
      error: new OpenAiAuthenticationError(cause),
      message: "OpenAI authentication failed. Check OPENAI_API_KEY.",
    },
    {
      error: new OpenAiRateLimitError(cause),
      message: "The advice service is temporarily unavailable after retrying.",
    },
    {
      error: new OpenAiTimeoutError(cause),
      message: "The advice service did not respond in time.",
    },
    {
      error: new OpenAiConnectionError(cause),
      message:
        "Unable to reach the advice service. Check the network connection.",
    },
  ] as const;

  for (const { error, message } of cases) {
    assertEquals(adviceErrorMessage(error), message);
  }
});
