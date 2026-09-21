import { assertEquals } from "@std/assert";
import {
  JevAuthenticationError,
  JevConnectionError,
  JevRateLimitError,
  JevRequestTimeoutError,
} from "#infra/jev/jev_evaluator.ts";
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

Deno.test("executionErrorMessage maps classified Jev failures", () => {
  const cause = new Error("SDK failure");
  assertEquals(
    executionErrorMessage(new JevAuthenticationError(cause)),
    "Authentication failed. Check TYPESAFE_API_KEY.",
  );
  assertEquals(
    executionErrorMessage(new JevRateLimitError(cause)),
    "The evaluation service is temporarily unavailable after retrying.",
  );
  assertEquals(
    executionErrorMessage(new JevRequestTimeoutError("deadline")),
    "The evaluation service did not respond in time.",
  );
  assertEquals(
    executionErrorMessage(new JevConnectionError(cause)),
    "Unable to reach the evaluation service. Check the network connection.",
  );
});

Deno.test("executionErrorMessage preserves unknown errors", () => {
  const error = new Error("gateway unavailable");
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
